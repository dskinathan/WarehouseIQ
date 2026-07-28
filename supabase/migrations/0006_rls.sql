-- Row-Level Security + grants. See docs/database/DATABASE.md §7.
--
-- Baseline grant: `authenticated` gets SELECT/INSERT/UPDATE on ordinary
-- tenant tables (RLS below narrows this per-row and per-role), but the
-- trust-ledger tables only ever get SELECT + INSERT — UPDATE/DELETE are
-- never granted at all, which is the load-bearing detail from
-- DATABASE.md: "nothing can ever be deleted" is a database guarantee, not
-- a UI convention, and it holds even against a manager, even via a direct
-- dashboard SQL edit.

grant usage on schema public to anon, authenticated, service_role;

-- Ordinary tenant tables: full CRUD grant to authenticated, RLS below
-- decides which rows/actions are actually allowed.
grant select, insert, update on
  organizations, profiles, memberships,
  warehouses, projects, locations,
  expected_inventory_records, expected_serial_numbers,
  csv_imports,
  pallets, serial_numbers, pallet_photos,
  pallet_exceptions, approval_requests
  to authenticated;

-- csv_import_rows: no DELETE, ever (raw upload data is always
-- re-derivable) — but UPDATE is fine, since status/validation_errors
-- change during an in-progress import. See DATABASE.md intro.
grant select, insert, update on csv_import_rows to authenticated;

-- The trust ledger: SELECT + INSERT only. No UPDATE, no DELETE, for any
-- role, ever — not even for managers, not even from a direct SQL session.
grant select, insert on pallet_movements, pallet_lifecycle_events, activity_log
  to authenticated;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table warehouses enable row level security;
alter table projects enable row level security;
alter table locations enable row level security;
alter table expected_inventory_records enable row level security;
alter table expected_serial_numbers enable row level security;
alter table csv_imports enable row level security;
alter table csv_import_rows enable row level security;
alter table pallets enable row level security;
alter table serial_numbers enable row level security;
alter table pallet_photos enable row level security;
alter table pallet_movements enable row level security;
alter table pallet_lifecycle_events enable row level security;
alter table activity_log enable row level security;
alter table pallet_exceptions enable row level security;
alter table approval_requests enable row level security;

-- organizations
create policy organizations_select on organizations for select
  using (id = current_org_id());
create policy organizations_update on organizations for update
  using (id = current_org_id() and current_role_in_org() = 'manager');

-- profiles: read self, or (as manager) anyone in your org
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or (
      current_role_in_org() = 'manager'
      and id in (select user_id from memberships where org_id = current_org_id())
    )
  );

-- memberships: org-scoped read; manager-only write
create policy memberships_select on memberships for select
  using (org_id = current_org_id());
create policy memberships_write on memberships for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy memberships_update on memberships for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

-- warehouses / projects / locations: worker reads, manager writes
create policy warehouses_select on warehouses for select using (org_id = current_org_id());
create policy warehouses_write on warehouses for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy warehouses_update on warehouses for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy projects_select on projects for select using (org_id = current_org_id());
create policy projects_write on projects for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy projects_update on projects for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy locations_select on locations for select using (org_id = current_org_id());
create policy locations_write on locations for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy locations_update on locations for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

-- Expected Inventory: worker reads, manager writes
create policy expected_inventory_select on expected_inventory_records for select
  using (org_id = current_org_id());
create policy expected_inventory_write on expected_inventory_records for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy expected_inventory_update on expected_inventory_records for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy expected_serials_select on expected_serial_numbers for select
  using (org_id = current_org_id());
create policy expected_serials_write on expected_serial_numbers for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy csv_imports_select on csv_imports for select using (org_id = current_org_id());
create policy csv_imports_write on csv_imports for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy csv_imports_update on csv_imports for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy csv_import_rows_select on csv_import_rows for select
  using (org_id = current_org_id());
create policy csv_import_rows_write on csv_import_rows for insert
  with check (org_id = current_org_id() and current_role_in_org() = 'manager');
create policy csv_import_rows_update on csv_import_rows for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

-- Pallets / serials / photos: both roles read + insert (in production,
-- insert happens via the rpc/* functions in API.md, which run the
-- exception-checking logic before writing); void/correction updates are a
-- manager action.
create policy pallets_select on pallets for select using (org_id = current_org_id());
create policy pallets_insert on pallets for insert with check (org_id = current_org_id());
create policy pallets_update on pallets for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

create policy serial_numbers_select on serial_numbers for select using (org_id = current_org_id());
create policy serial_numbers_insert on serial_numbers for insert with check (org_id = current_org_id());

create policy pallet_photos_select on pallet_photos for select using (org_id = current_org_id());
create policy pallet_photos_insert on pallet_photos for insert with check (org_id = current_org_id());

-- The trust ledger: everyone in the org can read; insert is org-scoped
-- (both roles, since both workers and managers can move/receive pallets);
-- there is no update or delete policy at all, and no grant to match (see
-- grants above) — this is intentional and load-bearing.
create policy pallet_movements_select on pallet_movements for select
  using (org_id = current_org_id());
create policy pallet_movements_insert on pallet_movements for insert
  with check (org_id = current_org_id());

create policy pallet_lifecycle_events_select on pallet_lifecycle_events for select
  using (org_id = current_org_id());
create policy pallet_lifecycle_events_insert on pallet_lifecycle_events for insert
  with check (org_id = current_org_id());

create policy activity_log_select on activity_log for select
  using (org_id = current_org_id());
create policy activity_log_insert on activity_log for insert
  with check (org_id = current_org_id());

-- Exceptions: both roles read; only managers resolve
create policy pallet_exceptions_select on pallet_exceptions for select
  using (org_id = current_org_id());
create policy pallet_exceptions_insert on pallet_exceptions for insert
  with check (org_id = current_org_id());
create policy pallet_exceptions_update on pallet_exceptions for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');

-- Approvals: worker reads their own requests; manager reads/decides all
create policy approval_requests_select on approval_requests for select
  using (
    org_id = current_org_id()
    and (current_role_in_org() = 'manager' or requested_by = auth.uid())
  );
create policy approval_requests_insert on approval_requests for insert
  with check (org_id = current_org_id());
create policy approval_requests_update on approval_requests for update
  using (org_id = current_org_id() and current_role_in_org() = 'manager');
