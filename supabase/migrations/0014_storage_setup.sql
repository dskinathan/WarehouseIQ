-- Storage bucket + access policies for pallet photos. This is not a new
-- feature — it's a deployment gap in the M2 photo-upload flow that was
-- already built (apps/mobile/src/lib/uploadPhoto.ts,
-- supabase/functions/extract-pallet). Without this, the very first photo
-- upload against a real Supabase project fails with permission denied,
-- and REAL SUPABASE ONLY: `storage.buckets`/`storage.objects` don't exist
-- in the bare-Postgres local dev stub (migration 0000), so this file
-- cannot be applied to the local test harness used for M0-M2 — it has
-- not been run against a real database. Apply it (or the equivalent
-- Storage dashboard clicks — see docs/operations/TEST_PLAN.md) before the
-- first real pallet scan.

insert into storage.buckets (id, name, public)
values ('pallet-photos', 'pallet-photos', false)
on conflict (id) do nothing;

-- Storage paths follow `{org_id}/{filename}` by convention (see
-- uploadPhoto.ts and extract-pallet's ownership check) — these policies
-- enforce the same convention at the database level: the first path
-- segment must equal the caller's own org_id. storage.foldername() is
-- Supabase's built-in helper for splitting an object path into segments.
create policy pallet_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pallet-photos'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy pallet_photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pallet-photos'
    and (storage.foldername(name))[1] = current_org_id()::text
  );
