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
Implemented in M2 (`supabase/functions/extract-pallet/index.ts`) using
Claude's tool-use/structured-output feature (a forced tool call, not
free-text JSON parsing) for reliable extraction. **Not exercised live** —
this environment has no Anthropic API key, no deployed Supabase project,
and no Deno Edge Functions runtime, so the code is written to the real
contract and carefully reviewed, but honestly untested end to end. The
Postgres side it calls into (`check_rate_limit`, and
`confirm_pallet_receipt` downstream) is verified for real.

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
- **Auth:** any authenticated worker/manager. Ownership of the photo is
  checked by storage-path convention (`{org_id}/{uuid}.ext`) against the
  caller's own `current_org_id()` — a guessed/borrowed path from another
  tenant is rejected with `403` before Claude is ever called.
- **Rate limiting:** `check_rate_limit('extract-pallet', 20, 60)` — 20
  calls per user per rolling 60 seconds, backed by the
  `rate_limit_events`/`check_rate_limit` Postgres function (migration
  0013, verified in `m2_acceptance.sql`), not in-memory counting — Edge
  Functions are stateless per invocation and may run on any regional
  instance, so an in-memory counter wouldn't actually limit anything.
  `429` once exceeded.
- **Errors:** `422` if the image is unreadable; `403` for a cross-org photo
  path or no active membership; `502` if Claude's response doesn't include
  the expected structured tool call. Always returns a confidence score
  even on a low-quality read, since low confidence is itself useful signal
  for the review screen.
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
**The most important function in the system.** Built and verified in M2
(`supabase/migrations/0011_rpc_confirm_pallet_receipt.sql`,
`supabase/tests/m2_acceptance.sql`, 10 checks passing).
- **Input:** `{ location_id, photo_storage_path, ai_extraction_raw,
  pallet_label_id, po_number, manufacturer, product, quantity,
  serial_numbers: string[], confidence, corrected_fields: string[],
  log_as_untracked: boolean, idempotency_key, dry_run: boolean }`
- **`photo_storage_path`, not a pre-existing `photo_id`** — a real
  implementation wrinkle the original sketch glossed over: a
  `pallet_photos` row can't exist before a pallet does (its `pallet_id` is
  `NOT NULL`), so the photo can't be created ahead of a decision that
  might not happen (a dry run). The client uploads the raw image to
  Storage and passes its path; this function creates the `pallet_photos`
  row itself, atomically with the pallet, only on a real (non-dry-run)
  commit.
- **`dry_run`** — the same function serves both the AI Review screen's
  preview (no writes, so the worker sees flagged issues before anything is
  saved) and the actual Confirm action (writes everything), rather than
  maintaining two copies of the matching/exception logic that could drift
  out of sync. The dry-run path does **not** take the Expected Inventory
  row lock (see below) — it's a best-effort preview; the real commit
  re-validates under the lock regardless of what the preview showed,
  so a state change between preview and confirm (someone else received
  the last unit in between) is still caught correctly.
- **Logic:**
  1. **Idempotency check** (skipped for dry runs, which write nothing): if
     a `pallet_movements` row already exists for `(org_id, idempotency_key)`,
     return that pallet's outcome instead of reprocessing — protects
     against a worker double-tapping Confirm after a dropped connection.
  2. If `log_as_untracked` is true, skip matching entirely:
     `match_status = unmatched_untracked`, `project_id = null`, and a
     `warning`-severity `unexpected_pallet` exception
     (`details.source = 'worker_declared'`). **Never blocks, never creates
     an `approval_requests` row** — see DATABASE.md §5 (approval-queue
     fatigue would defeat the safety feature).
  3. Otherwise, match by **`po_number` alone, not `(po_number,
     line_number)`** — a label doesn't print an internal line number.
     Candidates are every non-`fully_received` Expected Inventory row for
     that PO; if the PO has multiple open lines, the one whose
     manufacturer/product already agree is preferred, otherwise the
     earliest open line is used and the field-comparison checks below
     surface whatever mismatch results. On a real commit, this candidate
     row is fetched with `SELECT ... FOR UPDATE` — required because two
     workers confirming pallets against the same near-limit PO
     concurrently could otherwise both read a stale `received_quantity`
     and both pass the over-receipt check.
  4. `project_id` is set from the matched record's `project_id` — never
     from AI output (see `extract-pallet` below).
  5. Duplicate-pallet and duplicate-serial checks run **regardless** of
     match/untracked status — a mislabeled pallet is a mislabeled pallet
     either way. Then, if matched: `wrong_manufacturer`, `wrong_product`
     (warnings), a heuristic `quantity_mismatch` warning (this pallet's
     quantity vs. the PO's typical per-pallet amount — not a precise rule,
     the exact check is `over_receipt`), `over_receipt` (blocking — this
     pallet would push received quantity or pallet count past what's
     expected), `missing_expected_serials` (warning). `low_ai_confidence`
     (warning) fires per field below the org's `ai_confidence_threshold`
     that isn't in `corrected_fields`.
  6. `blocking` := any exception has `severity = blocking` (currently:
     `unknown_po`, `duplicate_pallet`, `duplicate_serial`, `over_receipt`).
  7. Dry run: return the analysis, no writes.
  8. Real commit: insert `pallets` (`receipt_status = pending_approval` if
     blocking, else `auto_approved`), `pallet_photos`, `pallet_movements`
     (`previous_location_id = null` — this is the pallet's first
     location), `serial_numbers`, and one `pallet_exceptions` row per
     detected exception (warning and blocking alike). If blocking, insert
     an `approval_requests` row and do **not** touch the Expected
     Inventory counters — a pending pallet hasn't been accepted yet. If
     not blocking and matched, increment `received_quantity` /
     `received_pallet_count` and recompute `status` on the Expected
     Inventory row, still under the lock from step 3.
- **Output:** `{ pallet_id, receipt_status, match_status, exceptions: [...],
  blocking, already_processed? }`.
- **Auth:** worker or manager, own org only.

### `rpc/decide_approval`
Built alongside `confirm_pallet_receipt` and verified in the same test
suite — no manager-facing screen calls this yet (that's M4's Exceptions &
Approval Queue), but the pending → decided → counters-update lifecycle is
tested end to end regardless.
- **Input:** `{ approval_request_id, decision: 'approved' | 'rejected', notes? }`
- **Logic:** locks the request and the pallet; on `approved`, sets
  `receipt_status = approved` and — only now — applies the Expected
  Inventory counter increments that a clean auto-approval would have
  applied immediately. On `rejected`, sets `receipt_status = rejected`
  (retained, never deleted). Either way, resolves the pallet's open
  exceptions (`approved_override` or `resolved`).
- **A validated edge case, not a bug:** approving a `duplicate_pallet`
  exception as a second *active* pallet under the same label is rejected
  by the database itself (the partial unique index from migration 0010
  only allows one `auto_approved`/`approved` pallet per label) — which is
  correct, not a limitation to work around. Two genuinely distinct pallets
  sharing an identifying label would silently break every future
  duplicate-detection scan against that label; the real fix in that rare
  case is a corrected label on the physical pallet, not two active records
  pretending to be different things. The realistic manager action for a
  true duplicate is `rejected`.
- **Auth:** manager only.

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
