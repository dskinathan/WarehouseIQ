# WarehouseIQ — Database (Supabase)

## Migration order

Apply in numeric order:

1. `migrations/0000_local_dev_auth_stub.sql` — **local development / CI
   only.** Reproduces just enough of Supabase's `auth` schema (`auth.users`,
   `auth.uid()`) plus the `anon`/`authenticated`/`service_role` roles to
   exercise migrations 0001+ against a bare Postgres instance. **Skip this
   file when applying to a real Supabase project** — Supabase already
   provides all of it, and this file would conflict.
2. `migrations/0001_tenancy.sql` — organizations, profiles, memberships,
   `current_org_id()`/`current_role_in_org()` helpers.
3. `migrations/0002_warehouse_structure.sql` — warehouses, projects,
   locations.
4. `migrations/0003_expected_inventory.sql` — the Expected Inventory model
   (manual/CSV/future-ERP source-agnostic).
5. `migrations/0004_pallets.sql` — pallets, serial numbers, photos.
6. `migrations/0005_ledger.sql` — the hash-chained trust ledger (movements,
   lifecycle events, activity log), exceptions, approvals.
7. `migrations/0006_rls.sql` — Row-Level Security policies and grants.

Full schema rationale: `../docs/database/DATABASE.md`.

## Applying to a real Supabase project

```
supabase db push   # once this repo is linked to a Supabase project
```

or, applying manually via `psql` against the project's connection string,
**skip 0000** and run 0001 through 0006 in order.

## Local development / testing (no Supabase CLI/Docker required)

This repo was developed and the schema verified against a bare local
Postgres 16 instance (no Docker available in the environment M0 was built
in), using `0000_local_dev_auth_stub.sql` to reproduce Supabase's
`auth.uid()` contract. To reproduce:

```
initdb -D /tmp/wiq_pgdata --auth=trust
pg_ctl -D /tmp/wiq_pgdata -o '-k /tmp/wiq_pgrun -h 127.0.0.1 -p 5433' start
createdb -h 127.0.0.1 -p 5433 warehouseiq
for f in migrations/0000_local_dev_auth_stub.sql migrations/0001_tenancy.sql \
         migrations/0002_warehouse_structure.sql migrations/0003_expected_inventory.sql \
         migrations/0004_pallets.sql migrations/0005_ledger.sql migrations/0006_rls.sql \
         seed.sql; do
  psql -h 127.0.0.1 -p 5433 -d warehouseiq -v ON_ERROR_STOP=1 -f "$f"
done
psql -h 127.0.0.1 -p 5433 -d warehouseiq -v ON_ERROR_STOP=1 -f tests/m0_acceptance.sql
```

If a Supabase CLI + Docker are available instead, `supabase start` gives
you the real thing (real GoTrue auth, real PostgREST) and `0000` isn't
needed at all — just apply 0001-0006 against the local Supabase Postgres.

## `tests/m0_acceptance.sql`

Proves M0's acceptance criteria directly against the database, independent
of any application code:

1. A manager and worker in two different organizations can both operate,
   and neither organization's data is visible to the other (RLS).
2. No role — including a manager, including a direct SQL session — can
   `UPDATE` or `DELETE` a row in the trust ledger (grants revoked, not just
   policy-blocked).
3. The hash chain verifies as intact across a normal sequence of writes.
4. Tampering with a ledger row (simulating an actor with elevated database
   access bypassing the revoked grant) is detectable by recomputing the
   hash chain — it does not go unnoticed.

All six checks pass as of this migration set. Re-run after any schema
change that touches tenancy, the ledger, or RLS.
