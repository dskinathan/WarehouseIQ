-- M2 acceptance test: confirm_pallet_receipt, decide_approval,
-- check_rate_limit, and the pallets-table composite FK hardening.
-- Run after 0000-0013 + seed.sql (and, in this session, after m0/m1
-- acceptance have already run against the same database — distinct
-- pallet labels/POs are used throughout to avoid collisions with their
-- fixtures).
\set QUIET off
\pset pager off

-- Diane (Acme manager) sets up an Expected Inventory record to receive against.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);

insert into expected_inventory_records
  (id, org_id, warehouse_id, project_id, po_number, line_number, manufacturer, product, expected_quantity, expected_pallet_count, source)
values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'PO-7001', 1, 'Acme Manufacturing', 'Inverter Z', 100, 10, 'manual');

insert into expected_inventory_records
  (id, org_id, warehouse_id, project_id, po_number, line_number, manufacturer, product, expected_quantity, expected_pallet_count, source)
values
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'PO-7002', 1, 'Acme Manufacturing', 'Small Part', 5, 2, 'manual');

-- Marcus (Acme worker) does the actual receiving.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b')::text, false);

\echo '--- TEST 1: dry-run preview of a clean match reports no exceptions ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/preview.jpg', '{}'::jsonb,
  'PLT-M2-001', 'PO-7001', 'Acme Manufacturing', 'Inverter Z', 10,
  '{}', '{"po_number": 0.99, "quantity": 0.99}'::jsonb, '{}', false,
  gen_random_uuid(), true
) as dry_run_result \gset

select set_config('myapp.t1', :'dry_run_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t1')::jsonb;
begin
  if r->>'blocking' != 'false' or jsonb_array_length(r->'exceptions') != 0 then
    raise exception 'TEST 1 FAILED: clean match reported exceptions: %', r;
  end if;
  raise notice 'TEST 1 PASSED: clean match dry-run reports zero exceptions, not blocking';
end
$$;

\echo '--- TEST 2: committing the same clean match creates a pallet and updates Expected Inventory ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/plt-m2-001.jpg', '{}'::jsonb,
  'PLT-M2-001', 'PO-7001', 'Acme Manufacturing', 'Inverter Z', 10,
  '{}', '{"po_number": 0.99, "quantity": 0.99}'::jsonb, '{}', false,
  '11111111-1111-1111-1111-111111111111', false
) as commit_result \gset

select set_config('myapp.t2', :'commit_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t2')::jsonb;
  v_received int;
  v_pallet_count int;
begin
  if r->>'receipt_status' != 'auto_approved' then
    raise exception 'TEST 2 FAILED: expected auto_approved, got %', r;
  end if;
  select received_quantity, received_pallet_count into v_received, v_pallet_count
  from expected_inventory_records where id = '80000000-0000-0000-0000-000000000001';
  if v_received != 10 or v_pallet_count != 1 then
    raise exception 'TEST 2 FAILED: Expected Inventory counters did not update correctly (qty=%, pallets=%)', v_received, v_pallet_count;
  end if;
  raise notice 'TEST 2 PASSED: pallet committed, receipt_status auto_approved, Expected Inventory counters updated (10/1)';
end
$$;

\echo '--- TEST 3: retrying with the same idempotency key does not double-count ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/plt-m2-001.jpg', '{}'::jsonb,
  'PLT-M2-001', 'PO-7001', 'Acme Manufacturing', 'Inverter Z', 10,
  '{}', '{"po_number": 0.99, "quantity": 0.99}'::jsonb, '{}', false,
  '11111111-1111-1111-1111-111111111111', false
) as retry_result \gset

select set_config('myapp.t3', :'retry_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t3')::jsonb;
  v_received int;
begin
  if (r->>'already_processed') is distinct from 'true' then
    raise exception 'TEST 3 FAILED: retried idempotency key was not recognized: %', r;
  end if;
  select received_quantity into v_received from expected_inventory_records
  where id = '80000000-0000-0000-0000-000000000001';
  if v_received != 10 then
    raise exception 'TEST 3 FAILED: Expected Inventory was double-counted on retry (qty=%)', v_received;
  end if;
  raise notice 'TEST 3 PASSED: retried request recognized as already processed; no double-counting';
end
$$;

\echo '--- TEST 4: wrong manufacturer surfaces as a non-blocking warning ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/preview2.jpg', '{}'::jsonb,
  'PLT-M2-002', 'PO-7001', 'Wrong Corp', 'Inverter Z', 10,
  '{}', '{}'::jsonb, '{}', false, gen_random_uuid(), true
) as wrong_mfr_result \gset

select set_config('myapp.t4', :'wrong_mfr_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t4')::jsonb;
begin
  if r->>'blocking' != 'false' then
    raise exception 'TEST 4 FAILED: wrong_manufacturer should not block: %', r;
  end if;
  if not exists (select 1 from jsonb_array_elements(r->'exceptions') e where e->>'type' = 'wrong_manufacturer') then
    raise exception 'TEST 4 FAILED: wrong_manufacturer exception was not reported: %', r;
  end if;
  raise notice 'TEST 4 PASSED: manufacturer mismatch reported as a non-blocking warning';
end
$$;

\echo '--- TEST 5: duplicate pallet ID blocks and requires manager approval ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/dup.jpg', '{}'::jsonb,
  'PLT-M2-001', 'PO-7001', 'Acme Manufacturing', 'Inverter Z', 10,
  '{}', '{}'::jsonb, '{}', false, gen_random_uuid(), false
) as dup_result \gset

select set_config('myapp.t5', :'dup_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t5')::jsonb;
  v_pallet_id uuid;
  v_received int;
begin
  if r->>'receipt_status' != 'pending_approval' then
    raise exception 'TEST 5 FAILED: duplicate pallet ID should require approval: %', r;
  end if;
  v_pallet_id := (r->>'pallet_id')::uuid;
  if not exists (select 1 from approval_requests where entity_id = v_pallet_id and status = 'pending') then
    raise exception 'TEST 5 FAILED: no pending approval_requests row was created';
  end if;
  select received_quantity into v_received from expected_inventory_records
  where id = '80000000-0000-0000-0000-000000000001';
  if v_received != 10 then
    raise exception 'TEST 5 FAILED: Expected Inventory counters were updated before approval (qty=%)', v_received;
  end if;
  raise notice 'TEST 5 PASSED: duplicate pallet ID blocked, pending approval created, counters untouched until decided';
  perform set_config('myapp.pending_pallet_id', v_pallet_id::text, false);
end
$$;

\echo '--- TEST 6: unknown PO blocks; the same PO with Log as Untracked does not ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/unk.jpg', '{}'::jsonb,
  'PLT-M2-003', 'PO-DOES-NOT-EXIST', 'Someone', 'Something', 3,
  '{}', '{}'::jsonb, '{}', false, gen_random_uuid(), true
) as unknown_po_result \gset

select set_config('myapp.t6', :'unknown_po_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t6')::jsonb;
begin
  if r->>'blocking' != 'true' then
    raise exception 'TEST 6a FAILED: unknown PO should block: %', r;
  end if;
  raise notice 'TEST 6a PASSED: unknown PO blocks by default';
end
$$;

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/untracked.jpg', '{}'::jsonb,
  'PLT-M2-004', 'PO-DOES-NOT-EXIST', 'Someone', 'Something', 3,
  '{}', '{}'::jsonb, '{}', true, gen_random_uuid(), false
) as untracked_result \gset

select set_config('myapp.t6b', :'untracked_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t6b')::jsonb;
begin
  if r->>'receipt_status' != 'auto_approved' or r->>'match_status' != 'unmatched_untracked' then
    raise exception 'TEST 6b FAILED: Log as Untracked should auto-approve immediately: %', r;
  end if;
  raise notice 'TEST 6b PASSED: Log as Untracked proceeds immediately (non-blocking), flagged for manager review only';
end
$$;

\echo '--- TEST 7: over-receipt on a single pallet blocks ---'

select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/over.jpg', '{}'::jsonb,
  'PLT-M2-005', 'PO-7002', 'Acme Manufacturing', 'Small Part', 8,
  '{}', '{}'::jsonb, '{}', false, gen_random_uuid(), true
) as over_receipt_result \gset

select set_config('myapp.t7', :'over_receipt_result', false);
do $$
declare
  r jsonb := current_setting('myapp.t7')::jsonb;
begin
  if r->>'blocking' != 'true'
     or not exists (select 1 from jsonb_array_elements(r->'exceptions') e where e->>'type' = 'over_receipt')
  then
    raise exception 'TEST 7 FAILED: quantity exceeding expected should block as over_receipt: %', r;
  end if;
  raise notice 'TEST 7 PASSED: a pallet quantity that would exceed the PO''s expected total blocks as over-receipt';
end
$$;

reset role;

\echo '--- TEST 8: manager rejects the duplicate; approving a real, distinct pallet finalizes it ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);

-- TEST 5's pallet is a genuine duplicate scan of an already-active label
-- (PLT-M2-001, received in TEST 2) — the correct manager action is to
-- reject it, not wave it through as if it were separate inventory. The
-- partial unique index from migration 0010 backs this up structurally:
-- approving it as a second *active* pallet under the same label would
-- violate the index, by design (see 0010's comment) — two genuinely
-- distinct pallets can't share an identifying label without breaking
-- every future duplicate-detection scan against that label.
do $$
declare
  v_pallet_id uuid := current_setting('myapp.pending_pallet_id')::uuid;
  v_approval_id uuid;
  v_received int;
  v_status pallet_receipt_status;
begin
  select id into v_approval_id from approval_requests where entity_id = v_pallet_id and status = 'pending';
  perform decide_approval(v_approval_id, 'rejected', 'confirmed duplicate scan of PLT-M2-001, discarding');

  select receipt_status into v_status from pallets where id = v_pallet_id;
  if v_status != 'rejected' then
    raise exception 'TEST 8a FAILED: pallet receipt_status should be rejected, got %', v_status;
  end if;

  select received_quantity into v_received from expected_inventory_records
  where id = '80000000-0000-0000-0000-000000000001';
  if v_received != 10 then
    raise exception 'TEST 8a FAILED: Expected Inventory should be unaffected by a rejection (qty=%)', v_received;
  end if;

  raise notice 'TEST 8a PASSED: manager rejected the duplicate; pallet retained (not deleted) as rejected, counters untouched';
end
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b')::text, false);

-- A genuinely distinct pending pallet (a real over-receipt commit, not a
-- dry run) approves cleanly, and its Expected Inventory counters finalize
-- on approval rather than at the moment it was received pending.
select confirm_pallet_receipt(
  '40000000-0000-0000-0000-000000000001', 'photos/over-real.jpg', '{}'::jsonb,
  'PLT-M2-006', 'PO-7002', 'Acme Manufacturing', 'Small Part', 8,
  '{}', '{}'::jsonb, '{}', false, gen_random_uuid(), false
) as over_commit_result \gset

reset role;

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);

select set_config('myapp.t8', :'over_commit_result', false);
do $$
declare
  v_pallet_id uuid := (current_setting('myapp.t8')::jsonb ->> 'pallet_id')::uuid;
  v_approval_id uuid;
  v_status pallet_receipt_status;
  v_received int;
begin
  select id into v_approval_id from approval_requests where entity_id = v_pallet_id and status = 'pending';
  perform decide_approval(v_approval_id, 'approved', 'over by 3 units, acceptable, approving');

  select receipt_status into v_status from pallets where id = v_pallet_id;
  if v_status != 'approved' then
    raise exception 'TEST 8b FAILED: pallet receipt_status should be approved, got %', v_status;
  end if;

  select received_quantity into v_received from expected_inventory_records
  where id = '80000000-0000-0000-0000-000000000002';
  if v_received != 8 then
    raise exception 'TEST 8b FAILED: Expected Inventory should show 8 received only after approval, got %', v_received;
  end if;

  raise notice 'TEST 8b PASSED: approving a genuinely distinct pending pallet finalizes it and updates Expected Inventory counters on approval';
end
$$;

reset role;

\echo '--- TEST 9: rate limiting caps calls within the trailing window ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b')::text, false);

do $$
declare
  i int;
  v_ok boolean;
  v_final boolean;
begin
  for i in 1..5 loop
    v_ok := check_rate_limit('extract-pallet-test', 5, 60);
    if not v_ok then
      raise exception 'TEST 9 FAILED: call % should have been within the limit', i;
    end if;
  end loop;

  v_final := check_rate_limit('extract-pallet-test', 5, 60);
  if v_final then
    raise exception 'TEST 9 FAILED: 6th call within the window should have exceeded the limit of 5';
  end if;
  raise notice 'TEST 9 PASSED: rate limit correctly allows 5 calls and blocks the 6th within the window';
end
$$;

reset role;

\echo '--- TEST 10: pallets composite FK blocks cross-org location confusion ---'

do $$
begin
  begin
    insert into pallets (org_id, warehouse_id, pallet_label_id, current_location_id, quantity)
    values (
      '10000000-0000-0000-0000-000000000001', -- Acme Solar
      '20000000-0000-0000-0000-000000000001', -- Acme's own warehouse
      'PLT-CROSS-ORG',
      '40000000-0000-0000-0000-000000000002', -- Bright Energy's location
      1
    );
    raise exception 'TEST 10 FAILED: cross-org location reference on pallets was allowed';
  exception when foreign_key_violation then
    raise notice 'TEST 10 PASSED: cross-org location reference on pallets rejected at the constraint level';
  end;
end
$$;

\echo '--- ALL M2 ACCEPTANCE TESTS PASSED ---'
