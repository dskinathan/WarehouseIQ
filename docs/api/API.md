# WarehouseIQ — API Design

WarehouseIQ's backend is Supabase, so "the API" is three layers, not one:

1. **Direct table access via PostgREST**, gated entirely by the RLS policies
   in `DATABASE.md` — used for simple reads and manager CRUD on
   warehouses/projects/locations/expected inventory.
2. **Postgres RPC functions** (`SECURITY DEFINER`, exposed at
   `/rest/v1/rpc/*`) — used whenever an action must be transactional or must
   enforce business rules the database, not the client, should be trusted
   to enforce. This is where almost all of the interesting logic lives.
3. **Edge Functions** (Deno, `/functions/v1/*`) — used only when the server
   needs to call an external service (Claude Vision) or perform work that
   doesn't belong in a SQL transaction (parsing an uploaded CSV file).

**Authentication:** every call carries the caller's Supabase JWT. RLS and
every RPC function resolve `auth.uid()` → the caller's active membership
(`org_id`, `role`) and reject anything outside that scope — no endpoint
trusts an `org_id` passed in the request body.

---

## 1. Edge Functions

### `POST /functions/v1/extract-pallet`
**Purpose:** call Claude Vision on a pallet photo and return structured data.
Deliberately does *no* database writes — pure extraction, easy to retry.
- **Input:** `{ photo_storage_path }`
- **Output:** `{ pallet_label_id, po_number, manufacturer, quantity,
  product, serial_numbers: string[], confidence: { [field]: 0.0-1.0 } }`
  — **`project` is intentionally not part of this output.** A
  manufacturer's label doesn't print an internal project name; asking the
  AI to guess one produced a field with no ground truth to be right or
  wrong against. Project is derived downstream, in `rpc/confirm_pallet_receipt`,
  from the project already attached to whichever Expected Inventory
  Record the PO number matches. This was a correction made in the final
  architecture review, not the original design.
- **Auth:** any authenticated worker/manager in the org that owns the photo
  — the function verifies `photo_storage_path` belongs to the caller's org
  before invoking Claude, so a guessed/borrowed path from another tenant
  can't be used to read cross-tenant data or spend another org's AI budget.
- **Rate limiting:** capped per-user per-minute (e.g. 10 calls/min) — every
  call is a real, billable request to Claude; this is a cost/abuse control
  as much as a security one, added in the final architecture review.
- **Errors:** `422` if the image is unreadable; always returns a confidence
  score even on a low-quality read, since low confidence is itself useful
  signal for the review screen.
- **Future:** swap/ensemble with a second vision model; isolated behind
  this function so that change never touches client code.

### `POST /functions/v1/csv/validate`
**Purpose:** parse an uploaded Expected Inventory CSV against a column
mapping, without committing anything.
- **Input:** `{ file (storage path), column_mapping: { csv_column:
  target_field } }`
- **Output:** `{ import_id, row_count, valid_rows, error_rows: [{ row_number,
  errors: string[] }], preview: [...] }`
- **Auth:** manager only.
- File-size and MIME-type validated before parsing.
- Writes to `csv_imports`/`csv_import_rows` with `status = validating`, so a
  half-finished import is resumable.

### `POST /functions/v1/csv/commit`
**Purpose:** commit a validated import's rows into `expected_inventory_records`.
- **Input:** `{ import_id, row_numbers?: number[] }`
- **Output:** `{ committed_count, skipped_count }`
- **Auth:** manager only. Each row calls the same insert path as manual
  entry (`source = 'csv_import'`) — no parallel code path.

### `POST /functions/v1/users/invite`
**Purpose:** create a Supabase Auth invite + a `memberships` row scoped to
the inviting manager's org.
- **Input:** `{ email, full_name, role }`
- **Auth:** manager only.

---

## 2. Postgres RPC Functions (transactional core)

### `rpc/confirm_pallet_receipt`
**The most important function in the system.** Runs the entire receiving
decision atomically after the worker has reviewed/corrected the AI output.
- **Input:** `{ location_id, photo_id, pallet_label_id, po_number,
  manufacturer, product, quantity, serial_numbers: string[], confidence,
  corrected_fields: string[], log_as_untracked: boolean, idempotency_key }`
- **Logic:**
  1. **Idempotency check** (added in this review): if a pallet already
     exists for this `(org_id, idempotency_key)`, return its existing
     result rather than inserting again — protects against a worker
     double-tapping Confirm after a dropped connection.
  2. If `log_as_untracked` is true, skip matching entirely: create the
     pallet with `match_status = unmatched_untracked`,
     `receipt_status = auto_approved`, `project_id = null`, and open a
     `warning`-severity `unexpected_pallet` exception
     (`details.source = 'worker_declared'`) for manager review. **This path
     does not block the worker or create an `approval_requests` row** —
     see DATABASE.md §5 for why (approval-queue fatigue defeats the
     safety feature it exists to serve).
  3. Otherwise, `SELECT ... FOR UPDATE` the matching
     `expected_inventory_records` row by `(org_id, po_number, line_number)`
     — the row lock is required (added in this review) because two workers
     confirming pallets against the same near-limit PO concurrently could
     otherwise both read a stale `received_quantity` and both pass the
     over-receipt check.
  4. `project_id` is set from the matched record's `project_id` — never
     from AI output (see `extract-pallet` above).
  5. Run every exception check: `wrong_manufacturer`, `wrong_product`,
     `quantity_mismatch`, `duplicate_pallet`, `duplicate_serial`,
     `unknown_po` (no match found and `log_as_untracked` was false),
     `over_receipt`, `missing_expected_serials`, `low_ai_confidence`.
     `wrong_project` no longer applies to AI extraction (there's nothing
     to compare); it's retained for a different case — a worker manually
     overriding the derived project, which should still be flagged.
  6. If **no blocking exception**: insert `pallets`, `serial_numbers`,
     `pallet_movements` (both stamped with `idempotency_key`), increment
     the expected record's `received_quantity`/`received_pallet_count`/
     `status` (still under the row lock from step 3), write `activity_log`.
  7. If **any blocking exception** (`unknown_po`, `duplicate_pallet`,
     `duplicate_serial`, `over_receipt`): insert the pallet with
     `receipt_status = pending_approval`, insert `pallet_exceptions`, insert
     an `approval_requests` row, and do **not** increment the expected
     record's counters — a pending pallet hasn't been accepted yet.
  8. `warning`-severity exceptions are logged but never block confirmation.
- **Output:** `{ pallet_id, receipt_status, match_status, exceptions: [...] }`
- **Auth:** worker or manager, own org only.

### `rpc/move_pallet`
- **Input:** `{ pallet_id, new_location_id, photo_id, reason?,
  idempotency_key }`
- **Logic:** idempotency check first; validates the pallet's
  `lifecycle_status = 'in_stock'` and isn't already at `new_location_id`;
  inserts `pallet_movements`; updates `pallets.current_location_id`; writes
  `activity_log`.
- **Output:** `{ movement_id }`
- **Auth:** worker or manager.

### `rpc/record_lifecycle_event` — new in this review
**Purpose:** mark a pallet Shipped, Installed, Consumed, or Scrapped —
closing the gap where inventory that physically left the warehouse had no
way to stop counting as "in stock."
- **Input:** `{ pallet_id, event_type: shipped|installed|consumed|scrapped,
  reason?, destination_note?, photo_id?, idempotency_key }`
- **Logic:** idempotency check; inserts `pallet_lifecycle_events`; updates
  `pallets.lifecycle_status`; `current_location_id` is **not** cleared —
  it remains the pallet's last known physical location for historical
  reference; writes `activity_log`.
- **Output:** `{ lifecycle_event_id }`
- **Auth:** worker or manager. `scrapped` additionally requires a `reason`
  (not optional) since it represents a loss that a manager will need to
  explain later.

### `rpc/decide_approval`
- **Input:** `{ approval_request_id, decision: approved|rejected, notes? }`
- **Logic:** on `approved`, finalizes the linked pending pallet/movement
  (`receipt_status → approved`), resolves the linked `pallet_exceptions` as
  `approved_override`, and **now** increments the expected record's
  counters under the same row-locking discipline as step 3 above. On
  `rejected`, flips to `rejected` — retained, not deleted — and logs the
  reason.
- **Auth:** manager only.

### `rpc/search_inventory`
- **Input:** `{ query?, project_id?, warehouse_id?, lifecycle_status?,
  po_number? }`
- **Output:** paginated `pallets` rows joined with location/project names.
  Defaults to `lifecycle_status = 'in_stock'` unless the caller explicitly
  asks to include shipped/installed/consumed/scrapped pallets.
- **Auth:** worker or manager, own org only.

### `rpc/generate_qr_batch`
- **Input:** `{ location_ids: string[] }`
- **Output:** `{ location_id, qr_token, encoded_payload }[]`.
- **Auth:** manager only.

---

## 3. Direct Table Access (PostgREST + RLS)

Standard CRUD on `warehouses`, `projects`, `locations`,
`expected_inventory_records` (manual create/edit — CSV goes through the
Edge Functions above), and read access on `pallets`, `pallet_movements`,
`pallet_lifecycle_events`, `activity_log`, `pallet_exceptions`,
`approval_requests` for list/detail screens.

---

## 4. Security & Abuse Controls — expanded in this review

- **Rate limiting** on `extract-pallet` (real per-call AI cost).
- **Ownership checks** before any storage path is used server-side — a
  photo or CSV file path must belong to the caller's own org.
- **File validation:** size and MIME-type limits on photo and CSV uploads,
  enforced before any parsing/AI call.
- **EXIF stripping:** photo uploads have GPS/location EXIF metadata
  stripped by default on ingest. This is a deliberate privacy default, not
  a technical necessity — photo-based location verification (cross-
  checking EXIF GPS against the warehouse address as a fraud signal) is a
  plausible V2 feature, but only behind an explicit customer opt-in.
- **CSV formula-injection sanitization:** any cell value beginning with
  `=`, `+`, `-`, or `@` is neutralized (leading `'` prefix) whenever
  Expected Inventory data is exported back to CSV/Excel — otherwise an
  imported value could execute as a formula in a recipient's spreadsheet.
- **Idempotency keys** on every write RPC that a mobile client might
  retry (`confirm_pallet_receipt`, `move_pallet`, `record_lifecycle_event`).
- **Row locking** on the Expected Inventory row during
  `confirm_pallet_receipt`'s check-and-increment, closing a race between
  concurrent receipts against the same PO.

---

## 5. Future Expansion Path

- **V2 ERP/WMS integrations** land as new Edge Functions
  (`erp/sap/webhook`, `erp/netsuite/sync`, etc.) writing into
  `expected_inventory_records` with `source = 'erp_integration'` — the
  exact same table, line-item structure, and matching logic. No schema
  change, no new matching logic, only a new producer of the same record.
- **Public partner API** (V4) — a versioned, API-key-authenticated wrapper
  around the same RPC functions.
- **Cryptographic anchoring** (V4) — externally publishing/signing the
  hash-chain heads from DATABASE.md §6 once an enterprise customer's
  compliance requirements ask for it.
