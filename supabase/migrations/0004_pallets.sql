-- Pallets & serials. See docs/database/DATABASE.md §4.

create type pallet_match_status as enum ('matched', 'unmatched_untracked');
create type pallet_receipt_status as enum
  ('auto_approved', 'pending_approval', 'approved', 'rejected');
create type pallet_lifecycle_status as enum
  ('in_stock', 'shipped', 'installed', 'consumed', 'scrapped');

-- Three independent status columns rather than one overloaded enum: a
-- pallet's approval state, physical/lifecycle state, and match state are
-- each real and independently queryable — this was a correction made in
-- the final architecture review (see DATABASE.md §4).
create table pallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  warehouse_id uuid not null references warehouses (id),
  pallet_label_id text not null,
  project_id uuid references projects (id), -- derived from the matched
    -- Expected Inventory Record's project_id — never asked of the AI
    -- (see API.md, corrected in the final architecture review)
  expected_inventory_record_id uuid references expected_inventory_records (id),
  match_status pallet_match_status not null default 'matched',
  receipt_status pallet_receipt_status not null default 'auto_approved',
  lifecycle_status pallet_lifecycle_status not null default 'in_stock',
  current_location_id uuid not null references locations (id),
  po_number text,
  manufacturer text,
  product text,
  quantity integer not null check (quantity >= 0),
  ai_confidence jsonb not null default '{}'::jsonb,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz -- a correction path, never a delete
);

create index pallets_org_id_idx on pallets (org_id);
create index pallets_label_idx on pallets (org_id, pallet_label_id);
create index pallets_expected_record_idx on pallets (expected_inventory_record_id);
create index pallets_location_idx on pallets (current_location_id);
-- "In stock" views filter on this composite condition constantly (Search
-- Inventory defaults to it, Warehouse Dashboard occupancy, Reports) —
-- see DATABASE.md §4.
create index pallets_in_stock_idx on pallets (org_id, lifecycle_status)
  where voided_at is null;

create table serial_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  pallet_id uuid not null references pallets (id),
  serial_value text not null,
  status text not null default 'received'
    check (status in ('received', 'duplicate', 'mismatched')),
  created_at timestamptz not null default now()
);

create index serial_numbers_pallet_idx on serial_numbers (pallet_id);
-- Duplicate serial detection is a constraint violation caught before
-- insert, not an application-level scan. Scoped to non-voided pallets so a
-- voided pallet's serials don't permanently block reuse of a real serial.
create unique index serial_numbers_unique_active_idx on serial_numbers (org_id, serial_value)
  where status != 'mismatched';

alter table expected_serial_numbers
  add constraint expected_serial_numbers_matched_fk
  foreign key (matched_serial_number_id) references serial_numbers (id);

create table pallet_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  pallet_id uuid not null references pallets (id),
  movement_id uuid, -- fk added in 0005 after pallet_movements exists
  storage_path text not null,
  taken_by uuid not null references profiles (id),
  taken_at timestamptz not null default now(),
  ai_extraction_raw jsonb,
  created_at timestamptz not null default now()
);

create index pallet_photos_pallet_idx on pallet_photos (pallet_id);

comment on column pallet_photos.storage_path is
  'EXIF GPS/location metadata is stripped from the uploaded file before it '
  'reaches this path — a deliberate privacy default from the final '
  'architecture review, not a technical necessity. See API.md Security.';
