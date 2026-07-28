-- Warehouse structure. See docs/database/DATABASE.md §2.

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  name text not null,
  address text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index warehouses_org_id_idx on warehouses (org_id);

create type project_status as enum ('active', 'completed', 'archived');

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  name text not null,
  code text not null, -- the human-readable "project number" — the single
                       -- source of truth; never duplicated on Expected
                       -- Inventory records (see DATABASE.md §2 design note)
  client_name text,
  status project_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create index projects_org_id_idx on projects (org_id);

create type location_status as enum ('active', 'inactive');

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  warehouse_id uuid not null references warehouses (id),
  name text not null,
  qr_token uuid not null default gen_random_uuid() unique,
  status location_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (warehouse_id, name)
);

create index locations_org_id_idx on locations (org_id);
create index locations_warehouse_id_idx on locations (warehouse_id);
