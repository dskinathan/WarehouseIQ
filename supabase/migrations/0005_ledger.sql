-- The trust ledger: movements, lifecycle events, activity log, exceptions,
-- approvals. See docs/database/DATABASE.md §5-§6.

create extension if not exists pgcrypto; -- for digest()

-- Tracks the last hash written per ledger table, so each new row can chain
-- to the previous one. Deliberately a single global chain per table across
-- all organizations (not one chain per org) — see DATABASE.md §6: this
-- makes tampering detectable platform-wide, not just within one tenant's
-- own view, without leaking any cross-tenant data (the chain values are
-- opaque hashes, not content).
create table ledger_chain_state (
  table_name text primary key,
  last_row_hash text not null
);

insert into ledger_chain_state (table_name, last_row_hash) values
  ('pallet_movements', repeat('0', 64)),
  ('pallet_lifecycle_events', repeat('0', 64)),
  ('activity_log', repeat('0', 64));

-- Generic BEFORE INSERT trigger: computes row_hash = sha256(prev_hash ||
-- canonical content of the new row), chained to the previous row in the
-- same table. This is what converts "we revoked UPDATE/DELETE" (true, but
-- only as strong as our own database configuration) into "any retroactive
-- edit breaks a verifiable hash chain" — detectable even by an actor with
-- elevated database access. Deliberately lightweight: no external key
-- management or signing; that's a V4 conversation (see ROADMAP.md).
-- security definer: app-facing roles never get direct grants on
-- ledger_chain_state (there's no legitimate reason for a client to touch
-- it), so the trigger runs with the function owner's privileges instead.
create or replace function ledger_hash_chain() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_hash text;
  content text;
begin
  select last_row_hash into prior_hash
  from ledger_chain_state
  where table_name = TG_TABLE_NAME
  for update;

  new.prev_hash := prior_hash;
  content := prior_hash || (to_jsonb(new) - 'row_hash' - 'prev_hash')::text;
  new.row_hash := encode(digest(content, 'sha256'), 'hex');

  update ledger_chain_state
  set last_row_hash = new.row_hash
  where table_name = TG_TABLE_NAME;

  return new;
end;
$$;

create type movement_approval_status as enum
  ('auto_approved', 'pending', 'approved', 'rejected');

-- Append-only (grants revoked in 0006) — this table *is* the product's
-- credibility.
create table pallet_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  pallet_id uuid not null references pallets (id),
  employee_id uuid not null references profiles (id),
  occurred_at timestamptz not null default now(),
  previous_location_id uuid references locations (id),
  new_location_id uuid not null references locations (id),
  photo_id uuid not null references pallet_photos (id),
  reason text,
  idempotency_key uuid not null,
  prev_hash text,
  row_hash text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index pallet_movements_pallet_idx on pallet_movements (pallet_id);
create index pallet_movements_org_idx on pallet_movements (org_id);

create trigger pallet_movements_hash_chain
  before insert on pallet_movements
  for each row execute function ledger_hash_chain();

alter table pallet_photos
  add constraint pallet_photos_movement_fk
  foreign key (movement_id) references pallet_movements (id);

create type lifecycle_event_type as enum
  ('shipped', 'installed', 'consumed', 'scrapped');

-- New table, added in the final architecture review: the original model
-- only supported location-to-location moves, forever, inside the
-- warehouse. Real project inventory eventually leaves — ships to a job
-- site, gets installed, consumed, or scrapped. Without this, that
-- inventory stayed "in stock" forever. See DATABASE.md §5.
create table pallet_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  pallet_id uuid not null references pallets (id),
  event_type lifecycle_event_type not null,
  employee_id uuid not null references profiles (id),
  occurred_at timestamptz not null default now(),
  reason text,
  destination_note text,
  photo_id uuid references pallet_photos (id),
  idempotency_key uuid not null,
  prev_hash text,
  row_hash text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key),
  -- Scrapped requires a reason (a loss a manager will need to explain
  -- later) — everything else's reason is optional.
  constraint scrapped_requires_reason
    check (event_type != 'scrapped' or reason is not null)
);

create index pallet_lifecycle_events_pallet_idx on pallet_lifecycle_events (pallet_id);
create index pallet_lifecycle_events_org_idx on pallet_lifecycle_events (org_id);

create trigger pallet_lifecycle_events_hash_chain
  before insert on pallet_lifecycle_events
  for each row execute function ledger_hash_chain();

-- General-purpose append-only audit log for everything that isn't a
-- location movement: record creation, field corrections, imports, user
-- management, approval decisions.
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  actor_id uuid not null references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  reason text,
  approval_status text,
  prev_hash text,
  row_hash text,
  created_at timestamptz not null default now()
);

create index activity_log_org_idx on activity_log (org_id);
create index activity_log_entity_idx on activity_log (entity_type, entity_id);

create trigger activity_log_hash_chain
  before insert on activity_log
  for each row execute function ledger_hash_chain();

create type exception_type as enum (
  'wrong_project', 'unknown_po', 'wrong_manufacturer', 'wrong_product',
  'quantity_mismatch', 'duplicate_pallet', 'duplicate_serial',
  'unexpected_pallet', 'over_receipt', 'missing_expected_serials',
  'low_ai_confidence'
);
create type exception_severity as enum ('blocking', 'warning');
create type exception_status as enum
  ('open', 'acknowledged', 'resolved', 'approved_override');

-- Exceptions are queryable/reportable, not buried in a jsonb blob on
-- movements. Severity is explicit policy (see DATABASE.md §5): unknown_po,
-- duplicate_pallet, duplicate_serial, and over_receipt are blocking;
-- everything else, including unexpected_pallet (Log as Untracked), is a
-- non-blocking warning reviewed asynchronously.
create table pallet_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  pallet_id uuid not null references pallets (id),
  movement_id uuid references pallet_movements (id),
  type exception_type not null,
  severity exception_severity not null,
  status exception_status not null default 'open',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  constraint exception_severity_matches_type check (
    (type in ('unknown_po', 'duplicate_pallet', 'duplicate_serial', 'over_receipt')
      and severity = 'blocking')
    or
    (type not in ('unknown_po', 'duplicate_pallet', 'duplicate_serial', 'over_receipt')
      and severity = 'warning')
  )
);

create index pallet_exceptions_org_idx on pallet_exceptions (org_id);
create index pallet_exceptions_pallet_idx on pallet_exceptions (pallet_id);
create index pallet_exceptions_open_idx on pallet_exceptions (org_id, status) where status = 'open';

create type approval_entity_type as enum ('pallet', 'movement');
create type approval_status as enum ('pending', 'approved', 'rejected');

-- Created only for blocking-severity exceptions — never for warnings.
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  entity_type approval_entity_type not null,
  entity_id uuid not null,
  requested_by uuid not null references profiles (id),
  reason text not null,
  status approval_status not null default 'pending',
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index approval_requests_org_idx on approval_requests (org_id);
create index approval_requests_pending_idx on approval_requests (org_id, status) where status = 'pending';
