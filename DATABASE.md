# WarehouseIQ — Database Design

**Engine:** Postgres via Supabase. **Tenancy:** every tenant-owned table
carries `org_id` and is protected by Row-Level Security. **Immutability:**
ledger tables (`pallet_movements`, `activity_log`, `csv_import_rows`) grant
`INSERT` only — `UPDATE`/`DELETE` are revoked at the Postgres role level, not
just blocked by policy, so "nothing is ever deleted" holds even against a
mistake in application code or a manual dashboard edit.

Every table below states **why it exists** — if we can't justify a table
against the product bible, it doesn't belong in V1.

---

## 1. Tenancy & Identity

### `organizations`
Why: the tenant boundary. Every other table's isolation traces back to this.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | |
| slug | text unique | for future subdomain/URL use |
| created_at | timestamptz | |
| archived_at | timestamptz null | orgs are deactivated, never deleted |

### `profiles`
Why: extends Supabase `auth.users` with our own role/org fields — `auth.users`
is Supabase-managed and we don't own its schema.
| column | type | notes |
|---|---|---|
| id | uuid pk, fk → auth.users.id | |
| org_id | uuid fk → organizations | **assumption: one user = one org in V1** (see §7) |
| full_name | text | |
| role | enum(`worker`,`manager`) | |
| status | enum(`invited`,`active`,`deactivated`) | deactivate, never delete a user |
| created_at | timestamptz | |

RLS: a user may only read profiles where `org_id = current_org_id()` (helper
function resolving `auth.uid()` → the caller's own `org_id`). Only `manager`
role may insert/update other profiles (user management).

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
collapsed that into `projects.code` — a single source of truth for a
project's human-readable identifier — rather than storing it twice. Expected
Inventory and pallets reference `project_id`; the code is looked up through
the relationship, never duplicated.

### `locations`
Why: the physical slot a pallet occupies; the thing a QR code encodes.
`id, org_id, warehouse_id, name (e.g. "Aisle 3 / Bay 2 / Level 1"), qr_token
(uuid, unique, what the QR image encodes), status enum(active, inactive),
created_at`

---

## 3. Expected Inventory — the "digital record" V1 verifies against

This is the most important addition from the original plan. Without it,
"verify physical vs. digital" has nothing external to check against. It is
explicitly designed as a **source-agnostic model**: manual entry, CSV
import, and a future ERP sync all populate the *same* table through
different `source` values — never separate systems.

### `expected_inventory_records`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid fk | |
| warehouse_id | uuid fk | |
| project_id | uuid fk | |
| po_number | text | |
| manufacturer | text | |
| product | text | |
| expected_quantity | integer | |
| expected_pallet_count | integer | |
| expected_delivery_date | date null | |
| status | enum(`expected`,`partially_received`,`fully_received`,`exception`) | derived, but stored for fast dashboard queries — recomputable from `received_quantity`/`received_pallet_count` if it ever drifts |
| received_quantity | integer default 0 | denormalized counter, updated transactionally by `rpc/confirm_pallet_receipt` |
| received_pallet_count | integer default 0 | same |
| source | enum(`manual`,`csv_import`,`erp_integration`) | |
| external_system_name | text null | e.g. "SAP", "NetSuite" — populated once V2 integrations exist |
| external_system_id | text null | the record's id in that external system, for future two-way sync/dedup |
| notes | text null | |
| created_by | uuid fk profiles | |
| created_at, updated_at | timestamptz | |

Unique constraint: `(org_id, po_number)` — one expected-inventory record per
PO per org. (If a PO legitimately spans multiple line items/products in V2,
this becomes `(org_id, po_number, product)`; not needed for V1's scope.)

### `expected_serial_numbers`
Why: serial-level expectation, separate child table for the same scaling
reason as `serial_numbers` below.
`id, org_id, expected_inventory_record_id, serial_value, status
enum(expected, received, missing), matched_serial_number_id null fk →
serial_numbers, created_at`

### `csv_imports` / `csv_import_rows`
Why: CSV import must be auditable and correctable row-by-row, per the
product requirement — not a black-box bulk insert.

`csv_imports`: `id, org_id, uploaded_by, filename, column_mapping jsonb,
status enum(validating, ready, committed, failed), row_count, error_count,
created_at, committed_at`

`csv_import_rows` (append-only): `id, import_id, org_id, row_number,
raw_data jsonb, validation_errors jsonb null, resulting_record_id null fk →
expected_inventory_records, status enum(pending, valid, error, imported)`

Keeping raw row data forever (not just the resulting record) is what makes
"saved import history" and "correct failed rows without re-uploading"
possible.

---

## 4. Pallets & Serials

### `pallets`
Why: the core inventory unit. Mutable current-state row — but every mutation
to a confirmed pallet's descriptive fields is required to go through
`rpc/*` functions that also write to `activity_log` with before/after
values; there is no direct client `UPDATE` grant on this table.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| org_id | uuid fk | |
| warehouse_id | uuid fk | denormalized for query speed |
| pallet_label_id | text | the ID as read off the physical label — **duplicate detection is scoped to `(org_id, pallet_label_id)` among active pallets**, not globally unique, since it's the customer's own label scheme, not ours |
| project_id | uuid fk null | null until resolved/confirmed |
| expected_inventory_record_id | uuid fk null | the matched expectation, if any — null means "unexpected pallet" |
| current_location_id | uuid fk | |
| po_number, manufacturer, product | text | as extracted/confirmed |
| quantity | integer | |
| ai_confidence | jsonb | per-field confidence scores from the extraction call |
| status | enum(`pending_approval`,`active`,`rejected`,`voided`) | `voided` is a status, never a delete |
| created_by | uuid fk profiles | |
| created_at, updated_at | timestamptz | |

### `serial_numbers`
Why: **explicit child table per the architecture decision**, so a pallet can
carry hundreds/thousands of serials without hitting array-column scaling or
indexing limits, and so each serial can independently carry its own
match/exception status.
`id, org_id, pallet_id, serial_value, status enum(received, duplicate,
mismatched), created_at`

Unique constraint: `(org_id, serial_value)` among non-voided pallets —
duplicate serial detection is a straightforward constraint violation
caught before insert, not an application-level scan.

### `pallet_photos`
`id, org_id, pallet_id, movement_id null, storage_path, taken_by, taken_at,
ai_extraction_raw jsonb (full model response, kept for audit/debugging),
created_at`

---

## 5. Movement, Exceptions, Approval — the trust ledger

### `pallet_movements` (append-only — insert-only grant)
Why: this table *is* the product's credibility. Every field the spec
requires is here, non-negotiably.
`id, org_id, pallet_id, employee_id fk profiles, occurred_at,
previous_location_id null, new_location_id, photo_id fk, reason text null,
approval_status enum(auto_approved, pending, approved, rejected),
approved_by null, exceptions jsonb (snapshot of exception codes at time of
move), created_at`

### `pallet_exceptions`
Why: exceptions need to be queryable/reportable ("see open exceptions" is a
named manager requirement), not buried inside a jsonb blob on movements.
`id, org_id, pallet_id, movement_id null, type enum(wrong_project,
unknown_po, wrong_manufacturer, wrong_product, quantity_mismatch,
duplicate_pallet, duplicate_serial, unexpected_pallet, over_receipt,
missing_expected_serials, low_ai_confidence), severity
enum(blocking, warning), status enum(open, acknowledged, resolved,
approved_override), details jsonb, created_at, resolved_by null,
resolved_at null`

### `approval_requests`
Why: generalized gate for anything a `blocking`-severity exception should
stop until a manager signs off — one table instead of a parallel "pending"
flag scattered across every entity type.
`id, org_id, entity_type enum(pallet, movement), entity_id, requested_by,
reason text, status enum(pending, approved, rejected), decided_by null,
decided_at null, notes null, created_at`

### `activity_log` (append-only — insert-only grant)
Why: the general-purpose audit ledger for everything that *isn't* a location
movement — record creation, field corrections, imports, user management,
approval decisions. One consistent shape rather than a bespoke history table
per entity.
`id, org_id, actor_id fk profiles, action text, entity_type, entity_id,
before jsonb null, after jsonb null, reason text null, approval_status
text null, created_at`

---

## 6. Row-Level Security Summary

Every tenant table's RLS policy reduces to one predicate:
`org_id = current_org_id()`, where `current_org_id()` is a `SECURITY
DEFINER` SQL function resolving the caller's `profiles.org_id`. On top of
that base isolation:

| Table | Worker | Manager |
|---|---|---|
| warehouses/projects/locations | read | read/write |
| expected_inventory_records + children | read | read/write |
| pallets, serial_numbers, pallet_photos | insert (via RPC), read | read, void (via RPC) |
| pallet_movements, activity_log | insert (via RPC only — no direct table grant) | read only, no write at all — **even managers cannot edit the ledger** |
| pallet_exceptions | read | read/resolve |
| approval_requests | read own | read/decide |
| profiles | read self | read/write org |

The load-bearing detail: **movement and activity history have no `UPDATE`
or `DELETE` grant for any role, including managers, including via the
Supabase dashboard.** That's what makes "nothing can ever be deleted" a
database guarantee instead of a UI convention.

---

## 7. Assumptions & Open Questions Flagged for the CTO Review

1. **One user → one organization.** Simplifies every RLS policy to a single
   lookup. Revisit if a consultant/contractor needs access to multiple
   customer orgs — that's a real pattern in this industry (EPC staff moving
   between projects) and may need a `memberships` join table sooner than
   V2. Flagged in the chat summary as a weak assumption worth a decision.
2. **`expected_inventory_records` unique key is `(org_id, po_number)`.**
   Breaks if a customer legitimately splits one PO across multiple
   products/line items. Cheap to widen to `(org_id, po_number, product)`
   now; expensive to migrate later if real PO data already violates it.
3. **Denormalized counters** (`received_quantity`, `received_pallet_count`,
   pallet's `warehouse_id`) trade a small drift risk for query speed. They're
   only ever written inside the same transaction as the event that changes
   them, so drift should only be possible from a bug, not concurrent access
   — but there's no reconciliation job in V1 to detect drift if one occurs.
