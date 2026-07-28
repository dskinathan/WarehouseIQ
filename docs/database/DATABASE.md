# WarehouseIQ — Database Design

**Engine:** Postgres via Supabase. **Tenancy:** every tenant-owned table
carries `org_id` and is protected by Row-Level Security. **Immutability:**
the trust-ledger tables — `pallet_movements`, `pallet_lifecycle_events`,
`activity_log` — grant `INSERT` only: `UPDATE`/`DELETE` are revoked at the
Postgres role level, not just blocked by policy, so "nothing is ever
deleted" holds even against a mistake in application code or a manual
dashboard edit. Every one of those rows is additionally **hash-chained**
(§6) so tampering is detectable even by an actor with elevated database
access. `csv_import_rows` deliberately gets a *weaker* guarantee: `DELETE`
is revoked (a row is never removed, so a raw upload is always
re-derivable), but `UPDATE` is allowed, because a row's `status` and
`validation_errors` legitimately change as it moves through
validation/correction before an import is committed — it's a staging
table for an in-progress import, not part of the permanent inventory
record. The permanent record is `expected_inventory_records` once
committed, mutable like every other non-ledger table via `rpc/*` functions
that log to `activity_log`.

Every table below states **why it exists** — if we can't justify a table
against the product bible, it doesn't belong in V1.

---

## 1. Tenancy & Identity

### `organizations`
Why: the tenant boundary. Every other table's isolation traces back to this.
`id, name, slug (unique), default_timezone (pre-fills new warehouses;
added in the pre-M2 review to replace a Settings field that previously
just displayed the first warehouse's timezone), created_at, archived_at null`

### `profiles`
Why: extends Supabase `auth.users` with fields not tied to any one
organization — a person's name, not their role within a specific tenant.
`id (pk, fk auth.users.id), full_name, created_at`

### `memberships` *(schema decision revised in this review)*
Why: the join between a person and an organization. **Originally modeled as
a single `org_id` column on `profiles`** — that only works if a user
belongs to exactly one org for life, which doesn't hold for this industry:
EPC/contractor staff routinely work across multiple client warehouses.
Retrofitting that after real customer data exists is a painful migration;
modeling it as a join table now costs nothing.

`id, user_id fk auth.users, org_id fk organizations, role
enum(worker, manager), status enum(invited, active, deactivated),
created_at` — unique on `(user_id, org_id)`.

**V1 product behavior stays simple despite the flexible schema:** there is
no org-switcher UI in V1. At login, the session's effective `org_id` is
fixed to the user's single active membership (the common case). If a user
ever has more than one active membership, V1 picks the most recently
active one and defers a switcher UI to V2 — the schema doesn't force that
constraint, the product does, and only the product needs to change later.

RLS: `current_org_id()` is a `SECURITY DEFINER` SQL function resolving the
caller's active membership for the org bound to the current session, and
`current_role()` similarly resolves the caller's role within that org.

---

## 2. Warehouse Structure

### `warehouses`
Why: top-level physical container a customer operates.
`id, org_id, name, address, timezone, archived_at, created_at`

### `projects`
Why: the unit inventory is allocated to — this is what prevents "wrong
project assignment," one of the core safety features.
`id, org_id, name, code (text, unique per org — the human-readable "project
number"), client_name, status enum(active, completed, archived), created_at`

*Design note:* the original spec listed "Project number" as a field on
Expected Inventory Records separately from "Project." We deliberately
collapsed that into `projects.code` — a single source of truth — rather
than storing it twice. Expected Inventory and pallets reference
`project_id`; the code is looked up through the relationship.

### `locations`
Why: the physical slot a pallet occupies; the thing a QR code encodes.
`id, org_id, warehouse_id, name, qr_token (uuid, unique), status
enum(active, inactive), created_at`

---

## 3. Expected Inventory — the "digital record" V1 verifies against

Explicitly a **source-agnostic model**: manual entry, CSV import, and a
future ERP sync all populate the *same* table through different `source`
values — never separate systems.

### `expected_inventory_records`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid fk | |
| warehouse_id | uuid fk | |
| project_id | uuid fk | |
| po_number | text | |
| line_number | integer default 1 | **new in this review** — see below |
| manufacturer | text | |
| product | text | |
| expected_quantity | integer | |
| expected_pallet_count | integer | |
| expected_delivery_date | date null | |
| status | enum(`expected`,`partially_received`,`fully_received`,`exception`) | derived, stored for fast dashboard queries |
| received_quantity | integer default 0 | denormalized counter, updated transactionally by `rpc/confirm_pallet_receipt` under a row lock (§5) |
| received_pallet_count | integer default 0 | same |
| source | enum(`manual`,`csv_import`,`erp_integration`) | |
| external_system_name | text null | e.g. "SAP" — populated once V2 integrations exist |
| external_system_id | text null | the record's id in the external system, for future two-way sync/dedup |
| notes | text null | |
| created_by | uuid fk profiles | |
| created_at, updated_at | timestamptz | |

**Uniqueness constraint, revised in this review:** `(org_id, po_number,
line_number)`, not `(org_id, po_number)`. The original single-PO key breaks
the moment a real customer's PO covers multiple line items — routine in
solar/energy procurement (one PO, separate lines for modules, racking,
inverters). `line_number` defaults to `1` so a simple single-line PO needs
no extra data entry; multi-line POs get one row per line. This also maps
directly onto how SAP/Oracle/NetSuite represent PO line items, so V2's ERP
sync populates this table with no schema change.

### `expected_serial_numbers`
`id, org_id, expected_inventory_record_id, serial_value, status
enum(expected, received, missing), matched_serial_number_id null fk →
serial_numbers, created_at`

### `csv_imports` / `csv_import_rows`
Why: CSV import must be auditable and correctable row-by-row.

`csv_imports`: `id, org_id, uploaded_by, filename, column_mapping jsonb,
status enum(validating, ready, committed, failed), row_count, error_count,
created_at, committed_at`

`csv_import_rows` (append-only): `id, import_id, org_id, row_number,
raw_data jsonb, validation_errors jsonb null, resulting_record_id null fk →
expected_inventory_records, status enum(pending, valid, error, imported)`

Raw row data is kept forever so a failed row can be corrected without
re-uploading. **Scope note from this review:** a dedicated "import history"
*screen* was cut from V1 as unnecessary UI polish (see SCREENS.md) — the
data model here is unchanged, since the audit value of keeping raw rows is
real even though the browsing UI isn't built yet. Every Expected Inventory
record still shows its originating import inline.

---

## 4. Pallets & Serials

### `pallets`
Why: the core inventory unit. Mutable current-state row — every mutation to
a confirmed pallet's descriptive fields goes through `rpc/*` functions that
also write to `activity_log` with before/after values; there is no direct
client `UPDATE` grant on this table.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid fk | |
| warehouse_id | uuid fk | denormalized for query speed |
| pallet_label_id | text | the ID as read off the physical label — duplicate detection scoped to `(org_id, pallet_label_id)` among active pallets |
| project_id | uuid fk null | **derived automatically from the matched Expected Inventory Record's `project_id`, never asked of the AI** (see §7, decision reversed in this review) |
| expected_inventory_record_id | uuid fk null | the matched expectation, if any |
| match_status | enum(`matched`,`unmatched_untracked`) | **new in this review** — see §5 Log-as-Untracked |
| receipt_status | enum(`auto_approved`,`pending_approval`,`approved`,`rejected`) | split out from a single overloaded `status` column so approval state, physical state, and match state are each independently queryable |
| lifecycle_status | enum(`in_stock`,`shipped`,`installed`,`consumed`,`scrapped`) default `in_stock` | **new in this review** — see §5 Lifecycle |
| current_location_id | uuid fk | last known physical location — **never cleared**, even after a terminal lifecycle event, so "where was this last seen" is always answerable |
| po_number, manufacturer, product | text | as extracted/confirmed |
| quantity | integer | |
| ai_confidence | jsonb | per-field confidence scores from the extraction call (numeric — surfaced to managers/reports; the worker-facing UI shows a simplified indicator instead, see DESIGN.md) |
| created_by | uuid fk profiles | |
| created_at, updated_at | timestamptz | |
| voided_at | timestamptz null | a correction path, never a delete |

"In stock" views/dashboards filter `WHERE lifecycle_status = 'in_stock' AND
voided_at IS NULL` — everything else is deliberately excluded from
inventory counts once it's left the trackable warehouse system.

### `serial_numbers`
`id, org_id, pallet_id, serial_value, status enum(received, duplicate,
mismatched), created_at` — unique on `(org_id, serial_value)` among
non-voided pallets.

### `pallet_photos`
`id, org_id, pallet_id, movement_id null, storage_path, taken_by, taken_at,
ai_extraction_raw jsonb, created_at`

Security requirement added in this review: uploads are validated
server-side for file size and MIME type before `extract-pallet` runs, and
EXIF GPS/location metadata is stripped by default on ingest (a deliberate
privacy default — see API.md §Security).

---

## 5. Movement, Lifecycle, Exceptions, Approval — the trust ledger

### `pallet_movements` (append-only — insert-only grant)
`id, org_id, pallet_id, employee_id fk profiles, occurred_at,
previous_location_id null, new_location_id, photo_id fk, reason text null,
idempotency_key uuid, prev_hash, row_hash, created_at` — unique on
`(org_id, idempotency_key)`, added in this review so a retried request from
a flaky mobile connection is a safe no-op instead of a duplicate ledger row.

### `pallet_lifecycle_events` (append-only — insert-only grant) — **new table, added in this review**
Why: the original model only supported location-to-location moves, forever,
inside the warehouse. Real project inventory eventually **leaves**: it
ships to a job site, gets installed, gets consumed, or gets scrapped as
damaged/unusable. Without an explicit terminal event, that inventory stays
"in stock" forever, undermining the exact trust the product sells.

`id, org_id, pallet_id, event_type enum(shipped, installed, consumed,
scrapped), employee_id fk profiles, occurred_at, reason, destination_note
(free text — job site name, shipment reference), photo_id null,
idempotency_key uuid, prev_hash, row_hash, created_at`

Recording one of these sets `pallets.lifecycle_status` accordingly. The
pallet's row and its full movement history remain forever — only its
inventory-count *classification* changes.

### `pallet_exceptions`
`id, org_id, pallet_id, movement_id null, type enum(wrong_project,
unknown_po, wrong_manufacturer, wrong_product, quantity_mismatch,
duplicate_pallet, duplicate_serial, unexpected_pallet, over_receipt,
missing_expected_serials, low_ai_confidence), severity enum(blocking,
warning), status enum(open, acknowledged, resolved, approved_override),
details jsonb, created_at, resolved_by null, resolved_at null`

**Severity is now explicit policy, not an implementation detail:**
`unknown_po`, `duplicate_pallet`, `duplicate_serial`, and `over_receipt` are
`blocking` — they gate the pallet via `approval_requests` below.
`wrong_project`, `wrong_manufacturer`, `wrong_product`,
`quantity_mismatch`, `missing_expected_serials`, and `low_ai_confidence` are
`warning` — visible to managers, don't stop the worker.

**`unexpected_pallet` is deliberately `warning`, not `blocking`** — this is
the "Log as Untracked" workflow added in this review. Not every pallet a
customer receives will have a matching PO (internal transfers, spares, ad
hoc items), and forcing every one of those through manager approval would
flood the queue until managers rubber-stamp everything out of fatigue,
quietly defeating the safety feature it's meant to provide. Instead: a
worker can proactively choose "Log as Untracked," the pallet is created
immediately with `match_status = unmatched_untracked` and
`receipt_status = auto_approved`, and an `unexpected_pallet` exception is
opened with `details.source = 'worker_declared'` (vs. `'ai_no_match'` when
the AI simply couldn't find a match) so a manager can review and triage it
asynchronously — without blocking warehouse operations.

### `approval_requests`
`id, org_id, entity_type enum(pallet, movement), entity_id, requested_by,
reason text, status enum(pending, approved, rejected), decided_by null,
decided_at null, notes null, created_at` — created only for `blocking`
exceptions, never for `warning` ones.

### `activity_log` (append-only — insert-only grant)
`id, org_id, actor_id fk profiles, action text, entity_type, entity_id,
before jsonb null, after jsonb null, reason text null, approval_status text
null, prev_hash, row_hash, created_at`

---

## 6. Hash-Chained Ledger — new in this review

`pallet_movements`, `pallet_lifecycle_events`, and `activity_log` each carry
`prev_hash` and `row_hash`. A `BEFORE INSERT` trigger computes
`row_hash = sha256(prev_hash || canonical_json(new_row))`, where
`prev_hash` is the `row_hash` of the previous row in that same table
(tracked via a small `ledger_chain_state` table storing the last hash per
ledger table, globally — not per org, so the tamper-evidence property holds
platform-wide, not just within one tenant's view).

This is deliberately lightweight: no external key management, no signing,
no publishing to a third party. It converts "we revoked the UPDATE/DELETE
grant" (true, but only as strong as our own database configuration) into
"any retroactive edit — including one made by someone with elevated
database access — breaks a verifiable hash chain." Cryptographic *signing*
and external anchoring (e.g., periodically publishing chain heads outside
our own infrastructure) is real additional value for a compliance-focused
enterprise customer, but that's a V4 conversation once one is asking for
it — the chain itself has to exist from day one, because you can't
retroactively hash-chain history that already has gaps.

---

## 6b. Composite Org-Scoped Foreign Keys — added in the pre-M2 review

A real gap found reviewing M1, not a style nitpick: every RLS insert/update
policy checked a row's *own* `org_id`, but never checked that its *other*
foreign keys (`warehouse_id`, `project_id`, etc.) belonged to that same
org. Nothing stopped a client from setting `org_id` to their own
organization while pointing `warehouse_id` at a different tenant's
warehouse. Fixed with the standard Postgres multi-tenant pattern: give each
parent table a `unique (id, org_id)` constraint, then have every child
table's foreign key reference `(child_fk, org_id)` against it instead of
just `child_fk`. A cross-org reference now fails at the constraint level —
`warehouses`, `projects`, `locations`, `expected_inventory_records`,
`expected_serial_numbers`, `csv_imports`, and `csv_import_rows` all carry
this. Applied to every M2+ table (`pallets` and everything referencing it)
from its very first migration, rather than retrofitted later.

## 6c. Automatic Activity Logging — added in the pre-M2 review

`activity_log` existed since M0 but nothing wrote to it during M1 —
creating a warehouse, project, location, or Expected Inventory record left
no audit trail, undercutting the product's own pitch. Fixed with a
generic `log_activity()` trigger (keyed off `TG_TABLE_NAME`/`NEW`/`OLD`, so
it works unmodified on any table with an `org_id` and `id` column) attached
to `warehouses`, `projects`, `locations`, and `expected_inventory_records`
for `INSERT`/`UPDATE`. A per-form call to log an action is easy to forget;
a trigger isn't.

---

## 7. Row-Level Security Summary

Every tenant table's RLS policy reduces to `org_id = current_org_id()`. On
top of that:

| Table | Worker | Manager |
|---|---|---|
| warehouses/projects/locations | read | read/write |
| expected_inventory_records + children | read | read/write |
| pallets, serial_numbers, pallet_photos | insert (via RPC), read | read, void (via RPC) |
| pallet_movements, pallet_lifecycle_events, activity_log | insert (via RPC only) | read only — **no write at all, even for managers** |
| pallet_exceptions | read | read/resolve |
| approval_requests | read own | read/decide |
| memberships | read own | read/write within org |
| profiles | read self | read (org-scoped via memberships) |

**Load-bearing detail, unchanged:** ledger tables have no `UPDATE`/`DELETE`
grant for any role, including managers, including via the Supabase
dashboard — and now, additionally, any tampering attempt breaks the hash
chain even for someone who bypasses the grant entirely.

---

## 8. Decisions From the Final Architecture Review (this revision)

Resolved, not just flagged:
1. **Multi-org membership** — `memberships` join table replaces a single
   `org_id` on `profiles`; V1 product behavior is unaffected, V2 org
   switching needs no schema change.
2. **Expected Inventory uniqueness** — widened to `(org_id, po_number,
   line_number)`.
3. **Inventory lifecycle** — `lifecycle_status` + `pallet_lifecycle_events`
   added; "in stock" excludes shipped/installed/consumed/scrapped.
4. **Log-as-Untracked** — `unexpected_pallet` is `warning`-severity,
   non-blocking, reviewed asynchronously.
5. **Idempotency keys** on movement/lifecycle writes to survive retried
   requests from flaky connections without duplicating ledger rows.
6. **Row locking** — `rpc/confirm_pallet_receipt` must `SELECT ... FOR
   UPDATE` the matched Expected Inventory row before evaluating
   quantity/over-receipt and incrementing counters, closing a race between
   two concurrent receipts against the same PO (see API.md).
7. **Hash-chained ledger** added — see §6.

## 9. Remaining Assumptions / Accepted Debt

1. **Denormalized counters** (`received_quantity`, etc.) trade a small
   drift risk for query speed; only ever written inside the same
   transaction as the triggering event, so drift should only come from a
   bug — there is still no reconciliation job in V1 to catch one if it
   occurs. Accepted for V1.
2. **No org-switcher UI** despite the schema supporting multiple
   memberships — accepted for V1, revisit in V2 if a pilot customer's
   staff actually need it.
