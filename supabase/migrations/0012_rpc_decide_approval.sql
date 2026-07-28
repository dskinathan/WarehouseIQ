-- Manager-only resolution for a blocking exception opened by
-- confirm_pallet_receipt. No manager-facing screen exists for this yet
-- (the Exceptions & Approval Queue is M4) — implemented and tested now
-- because it's the other half of the same transaction pair, and testing
-- the full pending -> approve -> counters-update lifecycle together is
-- worth more than testing confirm_pallet_receipt in isolation.

create or replace function decide_approval(
  p_approval_request_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_org_id();
  v_request approval_requests%rowtype;
  v_pallet pallets%rowtype;
begin
  if v_org_id is null or current_role_in_org() != 'manager' then
    raise exception 'only a manager may decide an approval request';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into v_request from approval_requests
  where id = p_approval_request_id and org_id = v_org_id
  for update;

  if v_request.id is null then
    raise exception 'approval request not found in your organization';
  end if;
  if v_request.status != 'pending' then
    raise exception 'this request was already decided (%)', v_request.status;
  end if;

  update approval_requests
  set status = p_decision::approval_status, decided_by = auth.uid(), decided_at = now(), notes = p_notes
  where id = p_approval_request_id;

  if v_request.entity_type = 'pallet' then
    select * into v_pallet from pallets where id = v_request.entity_id and org_id = v_org_id for update;

    if p_decision = 'approved' then
      update pallets set receipt_status = 'approved', updated_at = now() where id = v_pallet.id;

      if v_pallet.expected_inventory_record_id is not null then
        update expected_inventory_records
        set received_quantity = received_quantity + v_pallet.quantity,
            received_pallet_count = received_pallet_count + 1,
            status = (case
              when received_quantity + v_pallet.quantity >= expected_quantity
                and received_pallet_count + 1 >= expected_pallet_count then 'fully_received'
              else 'partially_received'
            end)::expected_inventory_status,
            updated_at = now()
        where id = v_pallet.expected_inventory_record_id;
      end if;
    else
      update pallets set receipt_status = 'rejected', updated_at = now() where id = v_pallet.id;
    end if;

    update pallet_exceptions
    set status = (case when p_decision = 'approved' then 'approved_override' else 'resolved' end)::exception_status,
        resolved_by = auth.uid(), resolved_at = now()
    where pallet_id = v_pallet.id and status = 'open';
  end if;

  return jsonb_build_object('status', p_decision);
end;
$$;

grant execute on function decide_approval(uuid, text, text) to authenticated;
