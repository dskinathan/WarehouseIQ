-- M0 acceptance test. Run after migrations 0000-0006 and seed.sql.
-- Proves the two things M0's milestone description names explicitly:
--   1. A manager and worker in two different orgs can both operate, and
--      neither org can see the other's data.
--   2. Tampering with the trust ledger is impossible via the app-facing
--      role, and any tampering that *does* happen (e.g. by a superuser
--      bypassing the grant) is detectable via the hash chain.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/m0_acceptance.sql
\set QUIET off
\pset pager off

\echo '--- TEST 1: tenant isolation on reads ---'

-- Impersonate Sam, the worker at Bright Energy.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000d')::text, false);

select current_org_id() as bright_energy_org_id, current_role_in_org() as bright_energy_role;

-- Sam should see exactly Bright Energy's one warehouse, never Acme's.
do $$
declare
  visible_count int;
begin
  select count(*) into visible_count from warehouses;
  if visible_count != 1 then
    raise exception 'TEST 1 FAILED: expected exactly 1 visible warehouse for Bright Energy worker, got %', visible_count;
  end if;
  raise notice 'TEST 1a PASSED: worker sees exactly % warehouse (their own org only)', visible_count;
end
$$;

do $$
declare
  leaked_name text;
begin
  select name into leaked_name from warehouses where name = 'Acme Main Yard';
  if leaked_name is not null then
    raise exception 'TEST 1 FAILED: Bright Energy worker could see Acme Solar warehouse data';
  end if;
  raise notice 'TEST 1b PASSED: Acme Solar''s warehouse is invisible to a Bright Energy user';
end
$$;

reset role;

\echo '--- TEST 2: worker can insert a pallet + movement for their own org ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b')::text, false);
select current_org_id() as acme_org_id, current_role_in_org() as acme_role;

insert into pallets (id, org_id, warehouse_id, pallet_label_id, current_location_id, quantity, created_by)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'PLT-9981',
  '40000000-0000-0000-0000-000000000001',
  12,
  '00000000-0000-0000-0000-00000000000b'
);

insert into pallet_photos (id, org_id, pallet_id, storage_path, taken_by)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'photos/plt-9981-1.jpg',
  '00000000-0000-0000-0000-00000000000b'
);

insert into pallet_movements (id, org_id, pallet_id, employee_id, new_location_id, photo_id, idempotency_key)
values (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000b',
  '40000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  gen_random_uuid()
);

do $$
begin
  raise notice 'TEST 2 PASSED: worker inserted pallet + movement for their own org';
end
$$;

\echo '--- TEST 3: Bright Energy cannot see Acme''s pallet/movement ---'

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000d')::text, false);

do $$
declare
  visible_count int;
begin
  select count(*) into visible_count from pallets;
  if visible_count != 0 then
    raise exception 'TEST 3 FAILED: Bright Energy worker could see % pallet(s) belonging to Acme Solar', visible_count;
  end if;
  raise notice 'TEST 3 PASSED: Acme Solar''s pallet is invisible to a Bright Energy user';
end
$$;

reset role;

\echo '--- TEST 4: no role, including manager, can UPDATE or DELETE the ledger ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);
select current_role_in_org() as should_be_manager;

do $$
begin
  begin
    update pallet_movements set reason = 'trying to rewrite history'
    where id = '70000000-0000-0000-0000-000000000001';
    raise exception 'TEST 4 FAILED: UPDATE on pallet_movements succeeded — it should be impossible for any role';
  exception when insufficient_privilege then
    raise notice 'TEST 4a PASSED: UPDATE on pallet_movements correctly denied (insufficient_privilege), even for a manager';
  end;

  begin
    delete from pallet_movements where id = '70000000-0000-0000-0000-000000000001';
    raise exception 'TEST 4 FAILED: DELETE on pallet_movements succeeded — it should be impossible for any role';
  exception when insufficient_privilege then
    raise notice 'TEST 4b PASSED: DELETE on pallet_movements correctly denied (insufficient_privilege), even for a manager';
  end;
end
$$;

reset role;

\echo '--- TEST 5: hash chain integrity ---'

do $$
declare
  r record;
  computed_hash text;
  expected_prev text := repeat('0', 64);
  mismatch_count int := 0;
  row_count int := 0;
begin
  for r in select * from pallet_movements order by created_at asc loop
    row_count := row_count + 1;
    if r.prev_hash != expected_prev then
      mismatch_count := mismatch_count + 1;
      raise notice 'Chain break at movement %: prev_hash does not match prior row_hash', r.id;
    end if;
    computed_hash := encode(digest(
      r.prev_hash || (to_jsonb(r) - 'row_hash' - 'prev_hash')::text,
      'sha256'
    ), 'hex');
    if computed_hash != r.row_hash then
      mismatch_count := mismatch_count + 1;
      raise notice 'Hash mismatch at movement %: stored row_hash does not match recomputed hash', r.id;
    end if;
    expected_prev := r.row_hash;
  end loop;

  if row_count = 0 then
    raise exception 'TEST 5 FAILED: no pallet_movements rows found to verify';
  end if;

  if mismatch_count > 0 then
    raise exception 'TEST 5 FAILED: % chain/hash mismatch(es) detected across % row(s)', mismatch_count, row_count;
  end if;

  raise notice 'TEST 5a PASSED: hash chain verified intact across % row(s)', row_count;
end
$$;

\echo '--- TEST 6: tampering (bypassing the revoked grant, as table owner) is detectable ---'

-- Simulates an actor with elevated database access (e.g. platform
-- operator, compromised service-role key) editing history directly —
-- something the revoked grant stops for the app role, but not for a
-- superuser/owner. The hash chain is what catches this.
update pallet_movements
set reason = 'tampered by a superuser bypassing the app-level grant'
where id = '70000000-0000-0000-0000-000000000001';

do $$
declare
  r record;
  computed_hash text;
  tamper_detected boolean := false;
begin
  select * into r from pallet_movements where id = '70000000-0000-0000-0000-000000000001';
  computed_hash := encode(digest(
    r.prev_hash || (to_jsonb(r) - 'row_hash' - 'prev_hash')::text,
    'sha256'
  ), 'hex');
  if computed_hash != r.row_hash then
    tamper_detected := true;
  end if;

  if not tamper_detected then
    raise exception 'TEST 6 FAILED: tampering with a ledger row was NOT detected by hash verification';
  end if;

  raise notice 'TEST 6 PASSED: tampering was detected — recomputed hash no longer matches stored row_hash';
end
$$;

\echo '--- ALL M0 ACCEPTANCE TESTS PASSED ---'
