-- Pre-M2 architecture review fixes: composite org-scoped FK integrity and
-- automatic activity logging. Run after 0000-0009 + seed.sql.
\set QUIET off
\pset pager off

\echo '--- TEST 1: cross-org FK confusion is now blocked at the constraint level ---'

do $$
begin
  begin
    -- Acme Solar's org_id with Bright Energy's warehouse_id: before this
    -- migration, RLS alone would have let this through since it only
    -- checked the row's own org_id.
    insert into locations (org_id, warehouse_id, name)
    values (
      '10000000-0000-0000-0000-000000000001', -- Acme Solar
      '20000000-0000-0000-0000-000000000002', -- Bright Energy's warehouse
      'Cross-tenant location attempt'
    );
    raise exception 'TEST 1 FAILED: cross-org warehouse_id/org_id mismatch was allowed';
  exception when foreign_key_violation then
    raise notice 'TEST 1 PASSED: cross-org reference rejected at the constraint level (%)', sqlerrm;
  end;
end
$$;

\echo '--- TEST 2: activity_log captures manager-configuration changes automatically ---'

set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a')::text, false);

insert into warehouses (org_id, name, timezone)
values ('10000000-0000-0000-0000-000000000001', 'Acme Overflow Yard', 'America/Denver');

do $$
begin
  if not exists (
    select 1 from activity_log
    where org_id = '10000000-0000-0000-0000-000000000001'
      and entity_type = 'warehouses'
      and action = 'insert'
      and actor_id = '00000000-0000-0000-0000-00000000000a'
      and after->>'name' = 'Acme Overflow Yard'
  ) then
    raise exception 'TEST 2 FAILED: creating a warehouse left no activity_log entry';
  end if;
  raise notice 'TEST 2 PASSED: warehouse creation was automatically logged with the correct actor';
end
$$;

reset role;

\echo '--- ALL PRE-M2 REVIEW ACCEPTANCE TESTS PASSED ---'
