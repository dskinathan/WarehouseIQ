-- M0 acceptance test fixture: two organizations, each with one manager and
-- one worker, one warehouse/project/location apiece. Used to prove tenant
-- isolation and the trust-ledger guarantees before any product UI exists.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'diane@acme-solar.example'),
  ('00000000-0000-0000-0000-00000000000b', 'marcus@acme-solar.example'),
  ('00000000-0000-0000-0000-00000000000c', 'priya@bright-energy.example'),
  ('00000000-0000-0000-0000-00000000000d', 'sam@bright-energy.example');

insert into profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Diane (Manager, Acme Solar)'),
  ('00000000-0000-0000-0000-00000000000b', 'Marcus (Worker, Acme Solar)'),
  ('00000000-0000-0000-0000-00000000000c', 'Priya (Manager, Bright Energy)'),
  ('00000000-0000-0000-0000-00000000000d', 'Sam (Worker, Bright Energy)');

insert into organizations (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Acme Solar', 'acme-solar'),
  ('10000000-0000-0000-0000-000000000002', 'Bright Energy', 'bright-energy');

insert into memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'manager'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'worker'),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002', 'manager'),
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000002', 'worker');

insert into warehouses (id, org_id, name, timezone) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Acme Main Yard', 'America/Denver'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Bright Central Warehouse', 'America/Chicago');

insert into projects (id, org_id, name, code) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Solar Farm A', 'P-101'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Substation B', 'P-201');

insert into locations (id, org_id, warehouse_id, name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Aisle 3 / Bay 2'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Yard - North');
