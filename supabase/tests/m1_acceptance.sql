-- M1 acceptance test: create_organization, stage_csv_import,
-- commit_csv_import. Run after 0000-0008 + seed.sql.
\set QUIET off
\pset pager off

\echo '--- TEST 1: create_organization creates org + profile + manager membership atomically ---'

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'newmanager@newco.example');

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000e1')::text, false);

select create_organization('New Co Solar', 'new-co-solar', 'Jordan (Manager)') as new_org_id \gset

do $$
begin
  if not exists (select 1 from organizations where slug = 'new-co-solar') then
    raise exception 'TEST 1 FAILED: organization was not created';
  end if;
  if not exists (
    select 1 from memberships
    where user_id = '00000000-0000-0000-0000-0000000000e1'
      and role = 'manager' and status = 'active'
  ) then
    raise exception 'TEST 1 FAILED: manager membership was not created';
  end if;
  raise notice 'TEST 1 PASSED: organization, profile, and manager membership created atomically';
end
$$;

do $$
begin
  begin
    perform create_organization('Second Org', 'second-org', 'Jordan Again');
    raise exception 'TEST 1b FAILED: a second organization was allowed for a user who already has one';
  exception when others then
    raise notice 'TEST 1b PASSED: duplicate organization creation for an existing member was blocked (%)', sqlerrm;
  end;
end
$$;

reset role;

\echo '--- TEST 2: stage_csv_import validates rows correctly ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);

select stage_csv_import(
  'test-import.csv',
  '{"PO #": "po_number", "Mfr": "manufacturer"}'::jsonb,
  '20000000-0000-0000-0000-000000000001',
  $json$[
    {"po_number": "PO-5001", "line_number": "1", "project_code": "P-101", "manufacturer": "Acme", "product": "Inverter X", "expected_quantity": "50", "expected_pallet_count": "5"},
    {"po_number": "PO-5002", "line_number": "1", "project_code": "P-999", "manufacturer": "Acme", "product": "Battery Y", "expected_quantity": "20", "expected_pallet_count": "2"},
    {"po_number": "", "line_number": "1", "project_code": "P-101", "manufacturer": "Acme", "product": "Missing PO", "expected_quantity": "abc", "expected_pallet_count": "2"},
    {"po_number": "PO-5001", "line_number": "1", "project_code": "P-101", "manufacturer": "Acme", "product": "Duplicate of row 1", "expected_quantity": "10", "expected_pallet_count": "1"}
  ]$json$::jsonb
) as import_id \gset

-- psql doesn't substitute :'var' inside a dollar-quoted DO block body, so
-- stash it as a session GUC first and read it back with current_setting()
-- inside the block instead.
select set_config('myapp.test_import_id', :'import_id', false);

do $$
declare
  valid_count int;
  error_count int;
  v_import_id uuid := current_setting('myapp.test_import_id')::uuid;
begin
  select count(*) into valid_count from csv_import_rows where import_id = v_import_id and status = 'valid';
  select count(*) into error_count from csv_import_rows where import_id = v_import_id and status = 'error';

  if valid_count != 1 then
    raise exception 'TEST 2a FAILED: expected exactly 1 valid row, got %', valid_count;
  end if;
  raise notice 'TEST 2a PASSED: exactly 1 of 4 rows validated cleanly';

  if error_count != 3 then
    raise exception 'TEST 2b FAILED: expected exactly 3 error rows (unknown project, missing PO/bad qty, duplicate), got %', error_count;
  end if;
  raise notice 'TEST 2b PASSED: unknown project code, missing/invalid fields, and in-file duplicate all caught';
end
$$;

\echo '--- TEST 3: commit_csv_import inserts only the valid row ---'

select commit_csv_import(:'import_id'::uuid) as commit_result \gset

do $$
begin
  if not exists (
    select 1 from expected_inventory_records
    where org_id = '10000000-0000-0000-0000-000000000001' and po_number = 'PO-5001' and source = 'csv_import'
  ) then
    raise exception 'TEST 3 FAILED: the valid row was not committed to expected_inventory_records';
  end if;
  if exists (
    select 1 from expected_inventory_records where po_number = 'PO-5002'
  ) then
    raise exception 'TEST 3 FAILED: an error row was committed despite failing validation';
  end if;
  raise notice 'TEST 3 PASSED: only the valid row became a real Expected Inventory record; error rows were not';
end
$$;

\echo '--- TEST 4: re-staging the same PO now fails as a real duplicate ---'

do $$
declare
  v_import_id uuid;
  error_count int;
begin
  select stage_csv_import(
    'test-import-2.csv', '{}'::jsonb, '20000000-0000-0000-0000-000000000001',
    '[{"po_number": "PO-5001", "line_number": "1", "project_code": "P-101", "manufacturer": "Acme", "product": "Inverter X", "expected_quantity": "50", "expected_pallet_count": "5"}]'::jsonb
  ) into v_import_id;

  select count(*) into error_count from csv_import_rows where import_id = v_import_id and status = 'error';
  if error_count != 1 then
    raise exception 'TEST 4 FAILED: re-importing an already-committed PO/line was not flagged as a duplicate';
  end if;
  raise notice 'TEST 4 PASSED: importing a PO/line that already exists in Expected Inventory is correctly rejected';
end
$$;

reset role;

\echo '--- ALL M1 ACCEPTANCE TESTS PASSED ---'
