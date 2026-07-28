# WarehouseIQ — API Design

WarehouseIQ's backend is Supabase, so "the API" is three layers, not one:

1. **Direct table access via PostgREST**, gated entirely by the RLS policies
   in `DATABASE.md` — used for simple reads and manager CRUD on
   warehouses/projects/locations/expected inventory.
2. **Postgres RPC functions** (`SECURITY DEFINER`, exposed at
   `/rest/v1/rpc/*`) — used whenever an action must be transactional (write
   to multiple tables atomically) or must enforce business rules the
   database, not the client, should be trusted to enforce. This is where
   almost all of the interesting logic lives.
3. **Edge Functions** (Deno, `/functions/v1/*`) — used only when the server
   needs to call an external service (Claude Vision) or perform work that
   doesn't belong in a SQL transaction (parsing an uploaded CSV file).

**Authentication:** every call carries the caller's Supabase JWT. RLS and
every RPC function resolve `auth.uid()` → `profiles.org_id` and role, and
reject anything outside the caller's own organization or role — there is no
endpoint that trusts an `org_id` passed in the request body.

---

## 1. Edge Functions

### `POST /functions/v1/extract-pallet`
**Purpose:** call Claude Vision on a pallet photo and return structured data.
Deliberately does *no* database writes — pure extraction, so it's easy to
retry/re-run without side effects.
- **Input:** `{ photo_storage_path }`
- **Output:** `{ pallet_label_id, project_guess, po_number, manufacturer,
  quantity, product, serial_numbers: string[], confidence: { [field]:
  0.0-1.0 } }`
- **Auth:** any authenticated worker/manager in the org that owns the photo.
- **Errors:** `422` if the image is unreadable; always returns a confidence
  score even on a low-quality read rather than failing outright, since a
  low-confidence result is itself useful signal for the review screen.
- **Future:** swap/ensemble with a second vision model; today it's a single
  call to Claude, isolated behind this function so that change never
  touches client code.

### `POST /functions/v1/csv/validate`
**Purpose:** parse an uploaded Expected Inventory CSV against a column
mapping, without committing anything.
- **Input:** `{ file (storage path), column_mapping: { csv_column:
  target_field } }`
- **Output:** `{ import_id, row_count, valid_rows, error_rows: [{ row_number,
  errors: string[] }], preview: [...] }`
- **Auth:** manager only.
- Writes to `csv_imports`/`csv_import_rows` with `status = validating`, so a
  half-finished import is resumable rather than lost if the manager closes
  the tab.

### `POST /functions/v1/csv/commit`
**Purpose:** commit a validated import's rows into `expected_inventory_records`.
- **Input:** `{ import_id, row_numbers?: number[] }` (omit to commit all
  valid rows; pass specific rows to commit a partial import after fixing
  only some errors)
- **Output:** `{ committed_count, skipped_count }`
- **Auth:** manager only. Each committed row calls the same insert path as
  manual entry (`source = 'csv_import'`) — no parallel code path.

### `POST /functions/v1/users/invite`
**Purpose:** create a Supabase Auth invite + a `profiles` row scoped to the
inviting manager's org. Needs the service role key (invite emails), so it
can't be a plain RLS-gated table insert.
- **Input:** `{ email, full_name, role }`
- **Auth:** manager only.

---

## 2. Postgres RPC Functions (transactional core)

### `rpc/confirm_pallet_receipt`
**The most important function in the system.** Runs the entire receiving
decision atomically after the worker has reviewed/corrected the AI output.
- **Input:** `{ location_id, photo_id, pallet_label_id, project_id,
  po_number, manufacturer, product, quantity, serial_numbers: string[],
  confidence, corrected_fields: string[] }`
- **Logic:**
  1. Look up a matching `expected_inventory_records` row by `(org_id,
     po_number)`.
  2. Run every exception check from `PRODUCT.md` §Core Workflows: wrong
     project, unknown PO, wrong manufacturer, wrong product, quantity
     mismatch, duplicate pallet, duplicate serial, unexpected pallet,
     over-receipt, missing expected serials, low AI confidence (any field
     below threshold not present in `corrected_fields`).
  3. If **no blocking exception**: insert `pallets`, `serial_numbers`,
     `pallet_movements` (`approval_status = auto_approved`), update the
     expected record's `received_quantity`/`received_pallet_count`/
     `status`, write `activity_log`.
  4. If **any blocking exception**: insert the pallet/movement with
     `status = pending_approval`, insert `pallet_exceptions` rows, insert an
     `approval_requests` row, and **do not** update the expected record's
     counters yet — a pending pallet hasn't been accepted into inventory.
  5. Non-blocking (`warning`) exceptions (e.g. low confidence that the
     worker already corrected) are logged but don't block confirmation.
- **Output:** `{ pallet_id, status, exceptions: [...] }`
- **Auth:** worker or manager, own org only.

### `rpc/move_pallet`
- **Input:** `{ pallet_id, new_location_id, photo_id, reason? }`
- **Logic:** validates the pallet is `active` and not already at
  `new_location_id`; inserts `pallet_movements` with the pallet's current
  location as `previous_location_id`; updates `pallets.current_location_id`;
  writes `activity_log`.
- **Output:** `{ movement_id }`
- **Auth:** worker or manager.

### `rpc/decide_approval`
- **Input:** `{ approval_request_id, decision: approved|rejected, notes? }`
- **Logic:** on `approved`, finalizes the linked pending pallet/movement
  (flips `status` to `active`, resolves the linked `pallet_exceptions` as
  `approved_override`, now updates the expected record's counters) and logs
  the decision. On `rejected`, flips the pallet/movement to `rejected` —
  **retained, not deleted** — and logs the reason.
- **Auth:** manager only.

### `rpc/search_inventory`
- **Input:** `{ query?, project_id?, warehouse_id?, status?, po_number? }`
- **Output:** paginated `pallets` rows joined with location/project names.
- **Auth:** worker or manager, own org only.

### `rpc/generate_qr_batch`
- **Input:** `{ location_ids: string[] }`
- **Output:** `{ location_id, qr_token, encoded_payload }[]` for the
  dashboard's printable-sheet renderer.
- **Auth:** manager only.

---

## 3. Direct Table Access (PostgREST + RLS, no custom function needed)

Standard CRUD on `warehouses`, `projects`, `locations`,
`expected_inventory_records` (manual create/edit only — CSV goes through
the Edge Functions above), and read access on `pallets`,
`pallet_movements`, `activity_log`, `pallet_exceptions`,
`approval_requests` for list/detail screens. No bespoke endpoint needed
where RLS alone already enforces the right access — writing a function just
to wrap a plain insert would be unnecessary layering.

---

## 4. Future Expansion Path

- **V2 ERP/WMS integrations** land as new Edge Functions
  (`erp/sap/webhook`, `erp/netsuite/sync`, etc.) that write into
  `expected_inventory_records` with `source = 'erp_integration'` and
  `external_system_id` populated — the exact same table and the exact same
  `rpc/confirm_pallet_receipt` matching logic. No schema change, no new
  matching logic, only a new producer of the same record.
- **Public partner API** (V4) would be a versioned, API-key-authenticated
  wrapper around the same RPC functions, not a parallel implementation.
