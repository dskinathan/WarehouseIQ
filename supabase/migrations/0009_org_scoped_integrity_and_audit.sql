-- Hardening found in the pre-M2 architecture review of M1. Two real gaps,
-- not style nitpicks:
--
-- 1. Every RLS insert/update policy so far checks a row's OWN org_id, but
--    never checks that its OTHER foreign keys (warehouse_id, project_id,
--    etc.) belong to that same org. Nothing stopped a client from setting
--    org_id to their own org while pointing warehouse_id at a different
--    tenant's warehouse. Fixed here with composite foreign keys — the
--    standard Postgres multi-tenant pattern: give each parent table a
--    unique (id, org_id) pair, then have children reference
--    (child_fk, org_id) against it. A cross-org reference now fails at
--    the constraint level, not just "would have been blocked by RLS if
--    someone remembered to check."
--
-- 2. `activity_log` existed but nothing wrote to it — creating a
--    warehouse/project/location/Expected Inventory record left no audit
--    trail, which undercuts the product's own pitch. Fixed with a
--    generic trigger, not a per-form call someone can forget to add.

-- --- Composite org-scoped foreign keys ---

alter table warehouses add constraint warehouses_id_org_unique unique (id, org_id);
alter table projects add constraint projects_id_org_unique unique (id, org_id);
alter table locations add constraint locations_id_org_unique unique (id, org_id);
alter table expected_inventory_records add constraint expected_inventory_id_org_unique unique (id, org_id);
alter table csv_imports add constraint csv_imports_id_org_unique unique (id, org_id);

alter table locations
  add constraint locations_warehouse_org_fk
  foreign key (warehouse_id, org_id) references warehouses (id, org_id);

alter table expected_inventory_records
  add constraint expected_inventory_warehouse_org_fk
  foreign key (warehouse_id, org_id) references warehouses (id, org_id),
  add constraint expected_inventory_project_org_fk
  foreign key (project_id, org_id) references projects (id, org_id);

alter table expected_serial_numbers
  add constraint expected_serials_record_org_fk
  foreign key (expected_inventory_record_id, org_id) references expected_inventory_records (id, org_id);

alter table csv_import_rows
  add constraint csv_import_rows_import_org_fk
  foreign key (import_id, org_id) references csv_imports (id, org_id),
  -- MATCH SIMPLE (the default): a null resulting_record_id skips the
  -- check entirely, which is exactly right — most rows don't have a
  -- resulting record until they're committed.
  add constraint csv_import_rows_result_org_fk
  foreign key (resulting_record_id, org_id) references expected_inventory_records (id, org_id);

-- --- Automatic activity logging ---

-- Deliberately generic (works via TG_TABLE_NAME/NEW/OLD) rather than a
-- bespoke function per table — a manager-configuration table added later
-- just needs this trigger attached, not new logging code written for it.
create or replace function log_activity() returns trigger
language plpgsql
as $$
begin
  insert into activity_log (org_id, actor_id, action, entity_type, entity_id, before, after)
  values (
    coalesce(new.org_id, old.org_id),
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    new.id,
    case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger warehouses_activity_log after insert or update on warehouses
  for each row execute function log_activity();
create trigger projects_activity_log after insert or update on projects
  for each row execute function log_activity();
create trigger locations_activity_log after insert or update on locations
  for each row execute function log_activity();
create trigger expected_inventory_activity_log after insert or update on expected_inventory_records
  for each row execute function log_activity();

-- --- Org-level default timezone (fixes a half-finished Settings field) ---

alter table organizations add column default_timezone text not null default 'UTC';
