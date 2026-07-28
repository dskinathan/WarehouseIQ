-- CSV import for Expected Inventory. Parsing happens client-side (M1 has
-- no server-side file handling yet — that's a reasonable simplification
-- for pilot-scale spreadsheets; see docs/api/API.md for the Edge-Function
-- version this can graduate to if very large files ever need it). These
-- two functions are the authoritative server-side validation and commit
-- step — the client cannot bypass duplicate-detection or required-field
-- checks by only validating in the browser.

-- Stages a batch of already column-mapped rows (jsonb objects keyed by
-- target field name, values as raw strings from the CSV) for one import,
-- running every validation rule, and returns the import id. Row-by-row
-- results are then read back via `select * from csv_import_rows where
-- import_id = ...` for the wizard's preview step.
create or replace function stage_csv_import(
  p_filename text,
  p_column_mapping jsonb,
  p_warehouse_id uuid,
  p_rows jsonb -- jsonb array of row objects
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_org_id();
  v_import_id uuid;
  v_row jsonb;
  v_row_number int := 0;
  v_errors jsonb;
  v_project_id uuid;
  v_project_code text;
  v_po text;
  v_line_number int;
  v_error_count int := 0;
  v_seen_keys text[] := array[]::text[];
  v_key text;
begin
  if v_org_id is null or current_role_in_org() != 'manager' then
    raise exception 'only a manager may import expected inventory';
  end if;

  if not exists (select 1 from warehouses where id = p_warehouse_id and org_id = v_org_id) then
    raise exception 'warehouse does not belong to your organization';
  end if;

  insert into csv_imports (org_id, uploaded_by, filename, column_mapping, status, row_count)
  values (v_org_id, auth.uid(), p_filename, p_column_mapping, 'validating', jsonb_array_length(p_rows))
  returning id into v_import_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;
    v_errors := '[]'::jsonb;

    v_po := nullif(trim(v_row->>'po_number'), '');
    v_project_code := nullif(trim(v_row->>'project_code'), '');

    if v_po is null then
      v_errors := v_errors || to_jsonb('PO Number is required'::text);
    end if;
    if coalesce(trim(v_row->>'manufacturer'), '') = '' then
      v_errors := v_errors || to_jsonb('Manufacturer is required'::text);
    end if;
    if coalesce(trim(v_row->>'product'), '') = '' then
      v_errors := v_errors || to_jsonb('Product is required'::text);
    end if;

    if coalesce(trim(v_row->>'expected_quantity'), '') !~ '^[0-9]+$' then
      v_errors := v_errors || to_jsonb('Expected Quantity must be a whole number'::text);
    end if;
    if coalesce(trim(v_row->>'expected_pallet_count'), '') !~ '^[0-9]+$' then
      v_errors := v_errors || to_jsonb('Expected Pallet Count must be a whole number'::text);
    end if;

    v_line_number := null;
    if coalesce(trim(v_row->>'line_number'), '') = '' then
      v_line_number := 1;
    elsif trim(v_row->>'line_number') ~ '^[0-9]+$' then
      v_line_number := (trim(v_row->>'line_number'))::int;
    else
      v_errors := v_errors || to_jsonb('Line Number must be a whole number'::text);
    end if;

    v_project_id := null;
    if v_project_code is null then
      v_errors := v_errors || to_jsonb('Project is required'::text);
    else
      select id into v_project_id from projects
        where org_id = v_org_id and code = v_project_code;
      if v_project_id is null then
        v_errors := v_errors || jsonb_build_array(format('Unknown project code "%s"', v_project_code));
      end if;
    end if;

    -- Duplicate detection: within this same import batch...
    if v_po is not null and v_line_number is not null then
      v_key := v_po || '::' || v_line_number::text;
      if v_key = any(v_seen_keys) then
        v_errors := v_errors || jsonb_build_array(
          format('Duplicate of an earlier row in this file (PO %s, line %s)', v_po, v_line_number));
      else
        v_seen_keys := v_seen_keys || v_key;
      end if;

      -- ...and against Expected Inventory records that already exist.
      if exists (
        select 1 from expected_inventory_records
        where org_id = v_org_id and po_number = v_po and line_number = v_line_number
      ) then
        v_errors := v_errors || jsonb_build_array(
          format('PO %s, line %s already exists in Expected Inventory', v_po, v_line_number));
      end if;
    end if;

    if jsonb_array_length(v_errors) > 0 then
      v_error_count := v_error_count + 1;
    end if;

    insert into csv_import_rows (import_id, org_id, row_number, raw_data, validation_errors, status)
    values (
      v_import_id,
      v_org_id,
      v_row_number,
      v_row || jsonb_build_object(
        'resolved_project_id', v_project_id,
        'resolved_line_number', v_line_number,
        'resolved_warehouse_id', p_warehouse_id
      ),
      case when jsonb_array_length(v_errors) > 0 then v_errors else null end,
      (case when jsonb_array_length(v_errors) > 0 then 'error' else 'valid' end)::csv_import_row_status
    );
  end loop;

  update csv_imports
  set status = 'ready', error_count = v_error_count
  where id = v_import_id;

  return v_import_id;
end;
$$;

grant execute on function stage_csv_import(text, jsonb, uuid, jsonb) to authenticated;

-- Commits every 'valid' row not yet imported (or a specific subset via
-- p_row_ids, for "fix the errors, import the rest now" partial commits)
-- into expected_inventory_records with source = 'csv_import'.
create or replace function commit_csv_import(
  p_import_id uuid,
  p_row_ids uuid[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_org_id();
  v_row record;
  v_new_id uuid;
  v_committed int := 0;
  v_skipped int := 0;
begin
  if v_org_id is null or current_role_in_org() != 'manager' then
    raise exception 'only a manager may import expected inventory';
  end if;

  if not exists (select 1 from csv_imports where id = p_import_id and org_id = v_org_id) then
    raise exception 'import not found in your organization';
  end if;

  for v_row in
    select * from csv_import_rows
    where import_id = p_import_id
      and org_id = v_org_id
      and status = 'valid'
      and resulting_record_id is null
      and (p_row_ids is null or id = any(p_row_ids))
  loop
    begin
      insert into expected_inventory_records (
        org_id, warehouse_id, project_id, po_number, line_number,
        manufacturer, product, expected_quantity, expected_pallet_count,
        expected_delivery_date, source, created_by
      ) values (
        v_org_id,
        (v_row.raw_data->>'resolved_warehouse_id')::uuid,
        (v_row.raw_data->>'resolved_project_id')::uuid,
        v_row.raw_data->>'po_number',
        (v_row.raw_data->>'resolved_line_number')::int,
        v_row.raw_data->>'manufacturer',
        v_row.raw_data->>'product',
        (v_row.raw_data->>'expected_quantity')::int,
        (v_row.raw_data->>'expected_pallet_count')::int,
        nullif(v_row.raw_data->>'expected_delivery_date', '')::date,
        'csv_import',
        auth.uid()
      )
      returning id into v_new_id;

      update csv_import_rows
      set status = 'imported', resulting_record_id = v_new_id
      where id = v_row.id;

      v_committed := v_committed + 1;
    exception when unique_violation then
      -- Created by a concurrent import/manual entry since staging ran.
      update csv_import_rows
      set status = 'error',
          validation_errors = coalesce(validation_errors, '[]'::jsonb)
            || to_jsonb('This PO/line was created by someone else since this file was validated'::text)
      where id = v_row.id;
      v_skipped := v_skipped + 1;
    end;
  end loop;

  update csv_imports
  set status = case
        when not exists (
          select 1 from csv_import_rows
          where import_id = p_import_id and status = 'valid' and resulting_record_id is null
        ) then 'committed'
        else status
      end,
      committed_at = now()
  where id = p_import_id;

  return jsonb_build_object('committed_count', v_committed, 'skipped_count', v_skipped);
end;
$$;

grant execute on function commit_csv_import(uuid, uuid[]) to authenticated;
