-- Tenancy & identity. See docs/database/DATABASE.md §1.
create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table profiles (
  id uuid primary key references auth.users (id),
  full_name text not null,
  created_at timestamptz not null default now()
);

create type membership_role as enum ('worker', 'manager');
create type membership_status as enum ('invited', 'active', 'deactivated');

-- Join table between a person and an organization — deliberately not a
-- single org_id column on profiles. See DATABASE.md §1 for why: EPC/
-- contractor staff routinely work across multiple client orgs, and
-- retrofitting that after real customer data exists is a painful
-- migration. V1's product/UI still behaves as one-org-per-session; only
-- the schema is future-proofed.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  org_id uuid not null references organizations (id),
  role membership_role not null,
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create index memberships_user_id_idx on memberships (user_id);
create index memberships_org_id_idx on memberships (org_id);

-- Resolves the caller's effective organization for this session. V1 has no
-- org-switcher UI, so "effective" means: the most recently created active
-- membership. A future org-switcher (V2) would instead read an explicit
-- claim set at login/switch time — this function is the single place
-- that changes when that ships.
create or replace function current_org_id() returns uuid
language sql stable
security definer
set search_path = public
as $$
  select org_id
  from memberships
  where user_id = auth.uid()
    and status = 'active'
  order by created_at desc
  limit 1;
$$;

create or replace function current_role_in_org() returns membership_role
language sql stable
security definer
set search_path = public
as $$
  select role
  from memberships
  where user_id = auth.uid()
    and org_id = current_org_id()
    and status = 'active'
  limit 1;
$$;
