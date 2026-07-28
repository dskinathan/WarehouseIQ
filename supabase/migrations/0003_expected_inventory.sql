-- Expected Inventory — the "digital record" V1 verifies against.
-- See docs/database/DATABASE.md §3.

create type expected_inventory_status as enum
  ('expected', 'partially_received', 'fully_received', 'exception');
create type expected_inventory_source as enum
  ('manual', 'csv_import', 'erp_integration');

create table expected_inventory_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  warehouse_id uuid not null references warehouses (id),
  project_id uuid not null references projects (id),
  po_number text not null,
  line_number integer not null default 1, -- widened key, added in the
    -- final architecture review: a single PO routinely covers multiple
    -- line items in solar/energy procurement (modules, racking, inverters
    -- on one PO). Defaults to 1 so a simple single-line PO needs no extra
    -- data entry. Maps directly onto how SAP/Oracle/NetSuite represent PO
    -- line items, so V2 ERP sync needs no schema change.
  manufacturer text not null,
  product text not null,
  expected_quantity integer not null check (expected_quantity >= 0),
  expected_pallet_count integer not null check (expected_pallet_count >= 0),
  expected_delivery_date date,
  status expected_inventory_status not null default 'expected',
  received_quantity integer not null default 0,
  received_pallet_count integer not null default 0,
  source expected_inventory_source not null,
  external_system_name text,
  external_system_id text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, po_number, line_number)
);

create index expected_inventory_org_id_idx on expected_inventory_records (org_id);
create index expected_inventory_po_idx on expected_inventory_records (org_id, po_number);
create index expected_inventory_project_idx on expected_inventory_records (project_id);

create type expected_serial_status as enum ('expected', 'received', 'missing');

create table expected_serial_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  expected_inventory_record_id uuid not null references expected_inventory_records (id),
  serial_value text not null,
  status expected_serial_status not null default 'expected',
  matched_serial_number_id uuid, -- fk to serial_numbers added in 0004 after that table exists
  created_at timestamptz not null default now()
);

create index expected_serials_record_idx on expected_serial_numbers (expected_inventory_record_id);

create type csv_import_status as enum ('validating', 'ready', 'committed', 'failed');
create type csv_import_row_status as enum ('pending', 'valid', 'error', 'imported');

create table csv_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  uploaded_by uuid not null references profiles (id),
  filename text not null,
  column_mapping jsonb not null default '{}'::jsonb,
  status csv_import_status not null default 'validating',
  row_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create index csv_imports_org_id_idx on csv_imports (org_id);

-- Append-only: raw row data is kept forever so a failed row can be
-- corrected without re-uploading. A dedicated "import history" screen was
-- cut from V1 as UI polish a pilot doesn't need yet (see SCREENS.md); this
-- table's audit value is unaffected.
create table csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references csv_imports (id),
  org_id uuid not null references organizations (id),
  row_number integer not null,
  raw_data jsonb not null,
  validation_errors jsonb,
  resulting_record_id uuid references expected_inventory_records (id),
  status csv_import_row_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index csv_import_rows_import_idx on csv_import_rows (import_id);
