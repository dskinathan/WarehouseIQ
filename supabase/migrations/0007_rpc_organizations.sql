-- Organization signup ("Create Company", docs/product/SCREENS.md #2).
-- Runs after Supabase Auth has already created the auth.users row for the
-- signing-up user (the client calls supabase.auth.signUp() first, then
-- this RPC in the same flow) — this function creates the organization,
-- the user's profile, and their manager membership atomically, so a
-- partial failure never leaves a user with an org but no membership, or
-- vice versa.
create or replace function create_organization(
  p_org_name text,
  p_org_slug text,
  p_manager_full_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create an organization';
  end if;

  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'this account already belongs to an organization';
  end if;

  insert into organizations (name, slug) values (p_org_name, p_org_slug)
  returning id into v_org_id;

  insert into profiles (id, full_name)
  values (auth.uid(), p_manager_full_name)
  on conflict (id) do update set full_name = excluded.full_name;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), v_org_id, 'manager', 'active');

  return v_org_id;
end;
$$;

grant execute on function create_organization(text, text, text) to authenticated;
