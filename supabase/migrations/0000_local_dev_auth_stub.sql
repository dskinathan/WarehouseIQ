-- LOCAL DEVELOPMENT / CI ONLY.
--
-- Do not run this against a real Supabase project — Supabase already
-- provides a fully-featured `auth` schema (auth.users, auth.uid(), JWT
-- claim parsing via GoTrue) that this file would conflict with.
--
-- Every other migration in this directory is written against the real
-- Supabase `auth.uid()` contract. This stub reproduces just enough of that
-- contract in a bare Postgres instance (no Docker/Supabase CLI available in
-- this environment) so the schema, RLS policies, and hash-chain triggers in
-- migrations 0001+ can be exercised and tested unmodified before a real
-- Supabase project exists. `scripts/apply_migrations.sh` skips this file
-- automatically when pointed at a real Supabase database.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Supabase's auth.uid() reads the JWT's "sub" claim out of
-- current_setting('request.jwt.claims'). We reproduce that exact contract
-- with a session-local GUC so tests can impersonate any user via
-- `select set_config('request.jwt.claims', json_build_object('sub', ...)::text, true);`
-- exactly the way PostgREST does in production.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

-- Supabase pre-creates these roles on every project. Guarded so this is
-- also safe to run (as a no-op) against a real Supabase database if this
-- file is ever accidentally included there.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
