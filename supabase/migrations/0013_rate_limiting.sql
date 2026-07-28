-- Backing store + check for the extract-pallet Edge Function's rate limit
-- (docs/api/API.md §4 Security & Abuse Controls) — every call is a real,
-- billable Claude API request, so this is a cost control as much as a
-- security one. Implemented as a Postgres-backed sliding window rather
-- than in-memory counting in the Edge Function, because Edge Functions
-- are stateless per invocation (and may run on any of several regional
-- instances) — an in-memory counter wouldn't actually limit anything.

create table rate_limit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  actor_id uuid not null,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on rate_limit_events (actor_id, bucket, created_at);

-- Old rows are cheap to accumulate at pilot scale and irrelevant to the
-- audit trail (this table has nothing to do with inventory correctness),
-- so it's plain insert/select — not part of the hash-chained ledger.
alter table rate_limit_events enable row level security;
create policy rate_limit_events_none on rate_limit_events for all using (false);
grant select, insert on rate_limit_events to authenticated;

-- Records one call and returns whether the caller is still within
-- p_limit calls in the trailing p_window_seconds. Called by the
-- extract-pallet Edge Function before it spends money calling Claude.
create or replace function check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_org_id();
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  insert into rate_limit_events (org_id, actor_id, bucket)
  values (v_org_id, auth.uid(), p_bucket);

  select count(*) into v_count
  from rate_limit_events
  where actor_id = auth.uid()
    and bucket = p_bucket
    and created_at > now() - make_interval(secs => p_window_seconds);

  return v_count <= p_limit;
end;
$$;

grant execute on function check_rate_limit(text, integer, integer) to authenticated;
