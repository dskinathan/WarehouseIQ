-- The core receiving transaction. See docs/api/API.md
-- rpc/confirm_pallet_receipt for the full design narrative.

-- M2 ships the AI review flow this was promised for back in M1's
-- Settings page comment ("nothing to tune until M2's AI review flow
-- exists... returns here when its underlying feature ships") — adding it
-- now, not as a separate feature, but completing that promise.
alter table organizations
  add column ai_confidence_threshold numeric(3, 2) not null default 0.75
  check (ai_confidence_threshold >= 0 and ai_confidence_threshold <= 1);

create or replace function confirm_pallet_receipt(
  p_location_id uuid,
  p_photo_storage_path text,
  p_ai_extraction_raw jsonb,
  p_pallet_label_id text,
  p_po_number text,
  p_manufacturer text,
  p_product text,
  p_quantity integer,
  p_serial_numbers text[] default '{}',
  p_confidence jsonb default '{}'::jsonb,
  p_corrected_fields text[] default '{}',
  p_log_as_untracked boolean default false,
  p_idempotency_key uuid default gen_random_uuid(),
  p_dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_org_id();
  v_warehouse_id uuid;
  v_threshold numeric;
  v_candidate expected_inventory_records%rowtype;
  v_exceptions jsonb := '[]'::jsonb;
  v_blocking boolean := false;
  v_match_status pallet_match_status;
  v_receipt_status pallet_receipt_status;
  v_pallet_id uuid;
  v_photo_id uuid;
  v_movement_id uuid;
  v_existing_pallet_id uuid;
  v_conf_row record;
  v_serial text;
  v_exc jsonb;
  v_result jsonb;
begin
  if v_org_id is null then
    raise exception 'must be an active member of an organization';
  end if;

  -- Idempotency: a retried request (dropped connection, double-tap on a
  -- flaky signal) returns the original outcome instead of a second
  -- pallet. Dry runs don't write anything, so they're never deduplicated.
  if not p_dry_run then
    select pm.pallet_id into v_existing_pallet_id
    from pallet_movements pm
    where pm.org_id = v_org_id and pm.idempotency_key = p_idempotency_key;

    if found then
      select jsonb_build_object(
        'pallet_id', p.id,
        'receipt_status', p.receipt_status,
        'match_status', p.match_status,
        'exceptions', '[]'::jsonb,
        'already_processed', true
      ) into v_result
      from pallets p where p.id = v_existing_pallet_id;
      return v_result;
    end if;
  end if;

  select l.warehouse_id into v_warehouse_id
  from locations l where l.id = p_location_id and l.org_id = v_org_id;

  if v_warehouse_id is null then
    raise exception 'location not found in your organization';
  end if;

  select o.ai_confidence_threshold into v_threshold
  from organizations o where o.id = v_org_id;

  -- Duplicate pallet ID: pre-checked here for a clear response; the
  -- partial unique index (migration 0010) is the structural backstop
  -- against a race between two concurrent scans of the same label.
  -- Scoped to confirmed pallets (auto_approved/approved) to match that
  -- index — a pending duplicate under review isn't "real" inventory yet,
  -- so it doesn't collide with a second pending record for the same label.
  if exists (
    select 1 from pallets
    where org_id = v_org_id and pallet_label_id = p_pallet_label_id
      and voided_at is null and receipt_status in ('auto_approved', 'approved')
  ) then
    v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
      'type', 'duplicate_pallet', 'severity', 'blocking', 'details', '{}'::jsonb));
    v_blocking := true;
  end if;

  if p_serial_numbers is not null and array_length(p_serial_numbers, 1) > 0 then
    if exists (
      select 1 from serial_numbers sn
      join pallets p on p.id = sn.pallet_id
      where sn.org_id = v_org_id and sn.serial_value = any(p_serial_numbers) and p.voided_at is null
    ) then
      v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
        'type', 'duplicate_serial', 'severity', 'blocking', 'details', '{}'::jsonb));
      v_blocking := true;
    end if;
  end if;

  if p_log_as_untracked then
    -- unexpected_pallet is always a warning (DATABASE.md §5) — logging as
    -- untracked never blocks the worker, regardless of anything else.
    v_match_status := 'unmatched_untracked';
    v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
      'type', 'unexpected_pallet', 'severity', 'warning',
      'details', jsonb_build_object('source', 'worker_declared')));
  else
    -- Match by PO number first — the AI reads what's printed on a label,
    -- and a label doesn't print an internal line number. When a PO has
    -- multiple open lines, prefer the one whose manufacturer/product
    -- already agree; otherwise fall back to the earliest open line and
    -- let the field-comparison checks below surface the mismatch.
    if p_dry_run then
      select * into v_candidate from expected_inventory_records
      where org_id = v_org_id and po_number = p_po_number and status != 'fully_received'
      order by (lower(manufacturer) = lower(coalesce(p_manufacturer, ''))
                and lower(product) = lower(coalesce(p_product, ''))) desc, line_number asc
      limit 1;
    else
      select * into v_candidate from expected_inventory_records
      where org_id = v_org_id and po_number = p_po_number and status != 'fully_received'
      order by (lower(manufacturer) = lower(coalesce(p_manufacturer, ''))
                and lower(product) = lower(coalesce(p_product, ''))) desc, line_number asc
      limit 1
      for update;
    end if;

    if v_candidate.id is null then
      v_match_status := 'unmatched_untracked';
      v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
        'type', 'unknown_po', 'severity', 'blocking',
        'details', jsonb_build_object('po_number', p_po_number)));
      v_blocking := true;
    else
      v_match_status := 'matched';

      if lower(v_candidate.manufacturer) != lower(coalesce(p_manufacturer, '')) then
        v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
          'type', 'wrong_manufacturer', 'severity', 'warning',
          'details', jsonb_build_object('expected', v_candidate.manufacturer, 'found', p_manufacturer)));
      end if;

      if lower(v_candidate.product) != lower(coalesce(p_product, '')) then
        v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
          'type', 'wrong_product', 'severity', 'warning',
          'details', jsonb_build_object('expected', v_candidate.product, 'found', p_product)));
      end if;

      -- Heuristic (not a precise rule): flags a single pallet's quantity
      -- looking far off the PO's typical per-pallet amount. The exact,
      -- hard check is over_receipt below.
      if v_candidate.expected_pallet_count > 0 and p_quantity is not null
         and abs(p_quantity - (v_candidate.expected_quantity::numeric / v_candidate.expected_pallet_count))
             > (v_candidate.expected_quantity::numeric / v_candidate.expected_pallet_count) * 0.2
      then
        v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
          'type', 'quantity_mismatch', 'severity', 'warning', 'details', '{}'::jsonb));
      end if;

      if (v_candidate.received_quantity + coalesce(p_quantity, 0)) > v_candidate.expected_quantity
         or (v_candidate.received_pallet_count + 1) > v_candidate.expected_pallet_count
      then
        v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
          'type', 'over_receipt', 'severity', 'blocking', 'details', jsonb_build_object(
            'expected_quantity', v_candidate.expected_quantity,
            'received_quantity', v_candidate.received_quantity,
            'this_pallet_quantity', p_quantity)));
        v_blocking := true;
      end if;

      if exists (
        select 1 from expected_serial_numbers
        where expected_inventory_record_id = v_candidate.id
          and serial_value != all(coalesce(p_serial_numbers, '{}'))
      ) then
        v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
          'type', 'missing_expected_serials', 'severity', 'warning', 'details', '{}'::jsonb));
      end if;
    end if;
  end if;

  -- Low AI confidence: any field below the org's threshold that the
  -- worker hasn't already reviewed/corrected on the review screen.
  for v_conf_row in select * from jsonb_each_text(p_confidence)
  loop
    if v_conf_row.value::numeric < v_threshold
       and not (v_conf_row.key = any(coalesce(p_corrected_fields, '{}')))
    then
      v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object(
        'type', 'low_ai_confidence', 'severity', 'warning',
        'details', jsonb_build_object('field', v_conf_row.key, 'confidence', v_conf_row.value)));
    end if;
  end loop;

  v_receipt_status := case when v_blocking then 'pending_approval' else 'auto_approved' end;

  if p_dry_run then
    return jsonb_build_object(
      'pallet_id', null,
      'receipt_status', v_receipt_status,
      'match_status', v_match_status,
      'matched_project_id', v_candidate.project_id,
      'exceptions', v_exceptions,
      'blocking', v_blocking
    );
  end if;

  insert into pallets (
    org_id, warehouse_id, pallet_label_id, project_id, expected_inventory_record_id,
    match_status, receipt_status, current_location_id,
    po_number, manufacturer, product, quantity, ai_confidence, created_by
  ) values (
    v_org_id, v_warehouse_id, p_pallet_label_id, v_candidate.project_id, v_candidate.id,
    v_match_status, v_receipt_status, p_location_id,
    p_po_number, p_manufacturer, p_product, p_quantity, p_confidence, auth.uid()
  ) returning id into v_pallet_id;

  insert into pallet_photos (org_id, pallet_id, storage_path, taken_by, ai_extraction_raw)
  values (v_org_id, v_pallet_id, p_photo_storage_path, auth.uid(), p_ai_extraction_raw)
  returning id into v_photo_id;

  insert into pallet_movements (
    org_id, pallet_id, employee_id, previous_location_id, new_location_id, photo_id, idempotency_key
  ) values (
    v_org_id, v_pallet_id, auth.uid(), null, p_location_id, v_photo_id, p_idempotency_key
  ) returning id into v_movement_id;

  if p_serial_numbers is not null then
    foreach v_serial in array p_serial_numbers loop
      insert into serial_numbers (org_id, pallet_id, serial_value) values (v_org_id, v_pallet_id, v_serial);
    end loop;
  end if;

  for v_exc in select * from jsonb_array_elements(v_exceptions)
  loop
    insert into pallet_exceptions (org_id, pallet_id, movement_id, type, severity, details)
    values (
      v_org_id, v_pallet_id, v_movement_id,
      (v_exc->>'type')::exception_type,
      (v_exc->>'severity')::exception_severity,
      v_exc->'details'
    );
  end loop;

  if v_blocking then
    insert into approval_requests (org_id, entity_type, entity_id, requested_by, reason)
    values (
      v_org_id, 'pallet', v_pallet_id, auth.uid(),
      'Blocking exception(s) at receiving: ' ||
        (select string_agg(e->>'type', ', ') from jsonb_array_elements(v_exceptions) e
         where e->>'severity' = 'blocking')
    );
  elsif v_match_status = 'matched' then
    update expected_inventory_records
    set received_quantity = received_quantity + p_quantity,
        received_pallet_count = received_pallet_count + 1,
        status = (case
          when received_quantity + p_quantity >= expected_quantity
            and received_pallet_count + 1 >= expected_pallet_count then 'fully_received'
          else 'partially_received'
        end)::expected_inventory_status,
        updated_at = now()
    where id = v_candidate.id;
  end if;

  return jsonb_build_object(
    'pallet_id', v_pallet_id,
    'receipt_status', v_receipt_status,
    'match_status', v_match_status,
    'exceptions', v_exceptions,
    'blocking', v_blocking
  );
end;
$$;

grant execute on function confirm_pallet_receipt(
  uuid, text, jsonb, text, text, text, text, integer, text[], jsonb, text[], boolean, uuid, boolean
) to authenticated;
