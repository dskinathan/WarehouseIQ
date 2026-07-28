# WarehouseIQ — Screen Specifications

Conventions used in every wireframe: `[Button]`, `(input)`, `<link/nav>`,
`{dynamic data}`. Wireframes are structural, not final visual design — see
`DESIGN.md` for the actual visual system.

Screens are grouped: **Shared**, **Manager Dashboard (web)**, **Worker App
(mobile)**. Several screens (Search, Pallet Details) are used by both roles
with permission differences noted inline.

**Changes from the final architecture review:** the AI no longer guesses
"Project" (derived from the matched PO instead — see AI Review Screen);
worker-facing confidence is shown as a simple indicator, not a raw
percentage; a "Log as Untracked" path was added to the receiving flow; a
new lifecycle action (Ship / Install / Consume / Scrap) was added to Pallet
Details; the standalone CSV Import History screen was cut (folded into
Expected Inventory List); Settings' Notification Preferences control was
removed (no backing feature until V2 push notifications); Warehouse
Dashboard's occupancy view was simplified from a heatmap to a plain list.

---

# Shared

## 1. Login

- **Purpose:** authenticate and route into the correct app surface by role.
- **Who uses it:** worker, manager.
- **Wireframe:**
```
+-----------------------------+
|          WarehouseIQ        |
|                             |
|  (email)                    |
|  (password)                 |
|                             |
|        [ Log In ]           |
|                             |
|  <Forgot password?>         |
+-----------------------------+
```
- **Buttons:** Log In.
- **Inputs:** email, password.
- **Navigation:** success → Manager Dashboard (manager) or Receive
  Inventory home (worker). No self-serve signup link — accounts are
  created via Create Company (first manager) or User Management invite
  (everyone after).
- **Features:** role-based redirect; session persistence.
- **Data displayed:** none.
- **Error states:** invalid credentials; account deactivated (explicit
  message, not a generic failure); network offline (mobile).
- **Empty states:** n/a.
- **Future improvements:** SSO/SAML (V4), biometric unlock on mobile.

## 2. Create Company

- **Purpose:** onboard a brand-new organization and its first manager
  account — the multi-tenant entry point.
- **Who uses it:** a prospective customer's first admin (becomes `manager`).
- **Wireframe:**
```
+-----------------------------+
|   Create your organization  |
|                             |
|  (company name)             |
|  (your full name)           |
|  (work email)               |
|  (password)                 |
|                             |
|      [ Create Account ]     |
+-----------------------------+
```
- **Buttons:** Create Account.
- **Inputs:** company name, full name, email, password.
- **Navigation:** success → guided next step ("add your first warehouse")
  → Warehouse Setup, not a bare dashboard.
- **Features:** creates `organizations` row + first `profiles` row
  (`role = manager`) atomically.
- **Data displayed:** none.
- **Error states:** company name/slug collision; weak password; email
  already in use (must not leak whether it belongs to another org).
- **Empty states:** n/a.
- **Future improvements:** invite-based team signup during onboarding
  instead of solo-then-invite; company logo/branding upload.

---

# Manager Dashboard (web)

## 3. Manager Dashboard (home)

- **Purpose:** the manager's landing page — a roll-up of what needs
  attention today, across every warehouse in the org.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| WarehouseIQ           {org name}      {user} [v] |
+--------------------------------------------------+
| <Warehouses> <Expected Inv.> <Activity> <Reports> |
+--------------------------------------------------+
|  Open Exceptions: {12}      Pending Approvals: {3}|
|                                                    |
|  Warehouses                                        |
|  +----------------+  +----------------+            |
|  | {Warehouse A}  |  | {Warehouse B}  |             |
|  | {n} pallets     |  | {n} pallets    |            |
|  | {n} exceptions  |  | {n} exceptions |            |
|  +----------------+  +----------------+            |
|                                                    |
|  Recent Activity                                   |
|  {timestamp} {user} {action}                        |
|  {timestamp} {user} {action}                        |
+--------------------------------------------------+
```
- **Buttons:** navigate into any warehouse card, jump to Exceptions queue.
- **Inputs:** none (filters only).
- **Navigation:** hub for every other manager screen via top nav.
- **Features:** exception/approval counts are live badges, not static.
- **Data displayed:** per-warehouse pallet counts, open exception counts,
  recent activity feed.
- **Error states:** partial data load (show what loaded, flag what didn't).
- **Empty states:** brand-new org — "Add your first warehouse" CTA instead
  of an empty grid.
- **Future improvements:** customizable widgets, saved views per manager.

## 4. Warehouse Dashboard

- **Purpose:** single-warehouse deep dive.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| <All Warehouses>  {Warehouse A}                   |
+--------------------------------------------------+
|  Pallets: {n}   Locations: {n}   Exceptions: {n}   |
|                                                    |
|  Occupancy                                         |
|  {Location}        {Occupied/Empty}  {Pallet ID}   |
|  {Location}        {Occupied/Empty}  {Pallet ID}   |
|                                                    |
|  <Projects in this warehouse>                      |
|  <Locations>   <Expected Inventory>                |
+--------------------------------------------------+
```
- **Buttons:** links into Location/Project/Expected Inventory management
  scoped to this warehouse.
- **Inputs:** date-range filter for activity.
- **Navigation:** from Manager Dashboard warehouse card; back to home.
- **Features:** occupancy answers "where is space free/full" at a glance.
  **Simplified from a heatmap to a plain list in the final architecture
  review** — a visual heatmap is real engineering effort for a V1 pilot,
  and a sortable list answers the same question with far less build cost;
  revisit as a heatmap once there's enough scale/dwell-time data to make
  one worth looking at.
- **Data displayed:** pallet count, location count, open exceptions,
  per-location occupancy.
- **Error states:** warehouse archived (read-only banner).
- **Empty states:** no locations yet → CTA to Warehouse Setup.
- **Future improvements:** heatmap by dwell time, capacity forecasting.

## 5. Warehouse Setup

- **Purpose:** create/edit a warehouse.
- **Who uses it:** manager.
- **Wireframe:**
```
+-----------------------------+
|  Warehouses         [ + New ]|
+-----------------------------+
|  {Warehouse A}   <Edit>      |
|  {Warehouse B}   <Edit>      |
+-----------------------------+
|  New/Edit Warehouse           |
|  (name)                       |
|  (address)                    |
|  (timezone)  [dropdown]       |
|      [ Save ]  [ Archive ]    |
+-----------------------------+
```
- **Buttons:** + New, Save, Archive (not Delete).
- **Inputs:** name, address, timezone.
- **Navigation:** from Manager Dashboard nav; leads into Location
  Management for the new warehouse.
- **Features:** archive instead of delete — archived warehouses stay
  queryable in history/reports.
- **Data displayed:** warehouse list with pallet/location counts.
- **Error states:** duplicate name in org (warning, not hard block —
  two sites can share a name legitimately).
- **Empty states:** no warehouses — first-run CTA.
- **Future improvements:** warehouse-level user assignment (restrict a
  worker to specific sites).

## 6. Project Management

- **Purpose:** create/edit projects inventory is allocated to.
- **Who uses it:** manager.
- **Wireframe:**
```
+-----------------------------+
|  Projects            [ + New ]|
+-----------------------------+
|  Code   Name        Status    |
|  {P-101}{Solar Farm A}{Active} |
|  {P-102}{Substation B}{Active} |
+-----------------------------+
|  New/Edit Project              |
|  (project code)                |
|  (name)                        |
|  (client name)                 |
|  (status) [dropdown]           |
|      [ Save ]                  |
+-----------------------------+
```
- **Buttons:** + New, Save.
- **Inputs:** code, name, client name, status.
- **Navigation:** from dashboard nav; project code feeds Expected
  Inventory and pallet matching.
- **Features:** `code` is the single canonical "project number" used
  everywhere else (see DATABASE.md design note — deliberately not
  duplicated on Expected Inventory records).
- **Data displayed:** project list with status.
- **Error states:** duplicate code in org.
- **Empty states:** none yet — CTA.
- **Future improvements:** project budgets/dates, client-facing project
  read-only portal (V3).

## 7. Location Management

- **Purpose:** define the physical slots pallets live in.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
|  {Warehouse A} > Locations           [ + New ]     |
+--------------------------------------------------+
|  Name              Status     QR                   |
|  Aisle 3 / Bay 2    Active   <View QR>              |
|  Aisle 3 / Bay 3    Active   <View QR>              |
|  Yard - North        Active   <View QR>              |
+--------------------------------------------------+
|  New/Edit Location                                  |
|  (name)                                             |
|      [ Save ]  [ Deactivate ]                       |
+--------------------------------------------------+
```
- **Buttons:** + New, Save, Deactivate, bulk-select → generate QR batch.
- **Inputs:** name (free text — supports whatever aisle/bay convention the
  customer already uses).
- **Navigation:** feeds QR Code Generator; back to Warehouse Dashboard.
- **Features:** bulk-create (e.g. "Aisle 1-10, Bay 1-5" pattern generator)
  to avoid 50 rounds of manual entry.
- **Data displayed:** location list, status, current pallet if occupied.
- **Error states:** duplicate name within warehouse.
- **Empty states:** first-run CTA.
- **Future improvements:** location capacity limits, zone-level grouping.

## 8. QR Code Generator

- **Purpose:** produce printable QR labels for locations.
- **Who uses it:** manager.
- **Wireframe:**
```
+-----------------------------+
|  Generate QR Codes            |
|  [x] Aisle 3 / Bay 2          |
|  [x] Aisle 3 / Bay 3          |
|  [ ] Yard - North             |
|                                |
|      [ Generate & Print ]     |
+-----------------------------+
|  Preview                        |
|  +--------+  +--------+         |
|  | [QR]   |  | [QR]   |         |
|  |Aisle 3 |  |Aisle 3 |         |
|  |Bay 2   |  |Bay 3   |         |
|  +--------+  +--------+         |
+-----------------------------+
```
- **Buttons:** Generate & Print (→ PDF), select all/none.
- **Inputs:** location checklist.
- **Navigation:** from Location Management.
- **Features:** each QR encodes `locations.qr_token`, a stable UUID —
  reprinting never changes the encoded value, so old labels never break.
- **Data displayed:** location name + QR preview per label.
- **Error states:** location has no token yet (shouldn't happen — generated
  at location creation).
- **Empty states:** nothing selected — Generate disabled.
- **Future improvements:** label templates matching common label-printer
  stock sizes.

## 9. Expected Inventory List

- **Purpose:** the manager's view of "what's supposed to arrive/be here" —
  the digital record V1 verifies against.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| Expected Inventory     [ + New ]  [ Import CSV ]   |
+--------------------------------------------------+
| (search: PO, manufacturer, product, project) [Go]  |
| Status: [All v]                                    |
+--------------------------------------------------+
| PO       Project   Product      Exp/Recv   Status  |
| PO-4471  P-101      Inverter X    50 / 32   Partial |
| PO-4488  P-102      Battery Y     20 / 20   Full    |
| PO-4502  P-101      Module Z      100 / 0   Expected|
+--------------------------------------------------+
```
- **Buttons:** + New, Import CSV, Export discrepancy report, row click →
  detail.
- **Inputs:** search text, status filter, project/PO/manufacturer filters.
- **Navigation:** → Expected Inventory Detail, → CSV Import Wizard.
- **Features:** expected-vs-received at a glance is the single most
  important manager view for proving the product's value.
- **Data displayed:** PO, project, manufacturer, product, expected/received
  quantity & pallet count, status.
- **Error states:** none beyond standard search-no-results.
- **Empty states:** no records — CTA to create manually or import CSV.
- **Future improvements:** saved filter views, ERP sync status column (V2).

## 10. Expected Inventory Detail

- **Purpose:** drill into one PO/expected record — what's arrived, what
  hasn't, what's flagged.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| <All Expected Inventory>  PO-4471                 |
+--------------------------------------------------+
| Project: P-101   Manufacturer: Acme   Product: X   |
| Expected: 50 units / 5 pallets   Received: 32 / 3   |
| Status: Partially Received     Source: CSV Import  |
+--------------------------------------------------+
| Received Pallets                                    |
|  {Pallet ID} {qty} {location} {received date}        |
| Expected Serials                                     |
|  {serial}  [Received / Missing]                      |
| Open Exceptions                                       |
|  {type} {pallet} {status}         [ Resolve ]         |
+--------------------------------------------------+
```
- **Buttons:** Edit record, Resolve exception, Approve/Reject (if pending).
- **Inputs:** none beyond edit form (shares Create/Edit screen).
- **Navigation:** from Expected Inventory List; links out to Pallet
  Details for any received pallet.
- **Features:** serial-level received/missing breakdown when expected
  serials were provided.
- **Data displayed:** full record + linked pallets + linked exceptions.
- **Error states:** n/a.
- **Empty states:** no pallets received yet.
- **Future improvements:** ERP sync history/diff view (V2).

## 11. Create / Edit Expected Inventory Record

- **Purpose:** manual entry of an expected shipment.
- **Who uses it:** manager.
- **Wireframe:**
```
+-----------------------------+
| New Expected Inventory Record |
|                                |
| Warehouse   [dropdown]        |
| Project     [dropdown]        |
| PO Number   (text)            |
| Manufacturer(text)            |
| Product     (text)            |
| Expected Qty (number)         |
| Expected Pallets (number)     |
| Delivery Date (date)          |
| Serials (optional, textarea)  |
| Notes (textarea)              |
|                                |
|      [ Save ]                 |
+-----------------------------+
```
- **Buttons:** Save.
- **Inputs:** all fields listed above; `source` is set to `manual`
  automatically, not user-editable.
- **Navigation:** from Expected Inventory List "+ New"; save → Detail
  screen.
- **Features:** optional expected-serials textarea (one per line) feeds
  `expected_serial_numbers`.
- **Data displayed:** n/a (form).
- **Error states:** duplicate PO in org (blocks save, links to the
  existing record instead).
- **Empty states:** n/a.
- **Future improvements:** template/duplicate-from-previous-PO.

## 12. CSV Import Wizard

- **Purpose:** bulk-populate Expected Inventory from an Excel/Smartsheet
  export, auditable row-by-row.
- **Who uses it:** manager.
- **Wireframe:**
```
Step 1: Upload
+-----------------------------+
| [ Choose File ]  {file.csv}   |
|      [ Next ]                 |
+-----------------------------+
Step 2: Map Columns
+-----------------------------+
| CSV Column      -> Field      |
| "PO #"          -> [PO Number]|
| "Mfr"           -> [Manufacturer]
| "Qty"           -> [Expected Qty]
|      [ Validate ]             |
+-----------------------------+
Step 3: Review
+-----------------------------+
| 48 valid rows, 3 errors        |
| Row 12: missing PO Number  [Fix]|
| Row 30: Qty is not a number [Fix]|
|      [ Import 48 Valid Rows ]  |
+-----------------------------+
Step 4: Done
+-----------------------------+
|  Imported 48 records.           |
|  <Back to Expected Inventory>   |
+-----------------------------+
```
- **Buttons:** Next, Validate, Fix (inline row edit), Import Valid Rows,
  Cancel (at any step, nothing commits until the final step).
- **Inputs:** file upload, column mapping dropdowns, inline row corrections.
- **Navigation:** from Expected Inventory List; final step → back to List.
- **Features:** partial commit (import the valid rows now, fix and
  re-import the rest later). **Cut in the final architecture review:** a
  standalone Import History screen and per-org remembered column mapping —
  both are real V1 UI effort for a pilot that will run a handful of
  imports total. The underlying data (every raw row, every import) is
  still kept forever per DATABASE.md; each Expected Inventory record simply
  shows its originating import inline (source + timestamp) rather than
  needing a dedicated browsing screen. Both cuts are UI-only, not
  data-model changes, and cheap to add back once import volume justifies
  the screen.
- **Data displayed:** row counts, per-row errors, preview table.
- **Error states:** unparseable file; no rows matched required columns.
- **Empty states:** n/a.
- **Future improvements:** scheduled/automatic import from a watched
  Smartsheet/Google Sheet (bridges toward V2 ERP sync).

## 13. Exceptions & Approval Queue

- **Purpose:** the manager's worklist for anything blocking-severity that
  a worker couldn't resolve alone.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| Exceptions & Approvals        Pending: {3}          |
+--------------------------------------------------+
| Needs Approval (blocking)                             |
| Unknown PO      {P-9981}  {Marcus}       2h ago       |
|   PO-9999 not found in Expected Inventory              |
|   [ View Photo ]  [ Approve ]  [ Reject ]              |
| Over-Receipt    {P-9982}  {Marcus}       1h ago        |
|   Would exceed expected 50 -> 54                        |
|   [ View Photo ]  [ Approve ]  [ Reject ]              |
|                                                          |
| For Review (not blocking anything)                       |
| Untracked Item  {P-9990}  {Marcus}       30m ago         |
|   Logged as untracked -- no matching PO                 |
|   [ View Photo ]  [ Acknowledge ]  [ Link to a PO ]      |
+--------------------------------------------------+
```
- **Buttons:** Approve, Reject (both require a note on reject), Acknowledge
  / Link to a PO (for review-only items), View Photo, filter by
  type/warehouse.
- **Inputs:** decision notes.
- **Navigation:** from Manager Dashboard badge; links to Pallet Details and
  Expected Inventory Detail.
- **Features:** the queue is split into two sections, added in this
  review — **Needs Approval** (`blocking` exceptions: unknown PO,
  duplicate pallet/serial, over-receipt) actually gates the pallet and
  must be approved or rejected before it counts as received; **For
  Review** (`warning` exceptions, including Log-as-Untracked items) never
  blocked anything and is purely informational — a manager can acknowledge
  it or retroactively link it to a PO if one turns out to exist, but there's
  no urgency-by-design here, which is the point: it keeps the blocking
  queue meaningful instead of drowning it in routine no-PO items. Approve
  finalizes the pending pallet/movement and updates Expected Inventory
  counters; reject retains the record as `rejected`, never deletes it.
- **Data displayed:** exception type, severity, pallet, photo, requester,
  elapsed time, related expected-record context.
- **Error states:** decision race (two managers act at once) — second
  decision is rejected with "already decided by {name}."
- **Empty states:** "No open exceptions" (a good state, shown positively).
- **Future improvements:** push notification to a manager's phone the
  moment a blocking exception is created.

## 14. Activity Log

- **Purpose:** the complete, append-only, org-wide audit trail.
- **Who uses it:** manager (workers see only their own actions, via Pallet
  Details/Timeline — not a global log).
- **Wireframe:**
```
+--------------------------------------------------+
| Activity Log                                       |
| (search)  Warehouse:[All v]  User:[All v]  Date:[  ]|
+--------------------------------------------------+
| Time      User     Action                Entity     |
| 10:32am   Marcus   Confirmed pallet       P-9980     |
| 10:15am   Marcus   Moved pallet           P-9975     |
| 9:58am    Diane    Approved exception     P-9970     |
| 9:40am    Diane    Imported 48 records    PO batch   |
+--------------------------------------------------+
```
- **Buttons:** filter controls, export.
- **Inputs:** search, warehouse/user/date filters.
- **Navigation:** row click → the affected pallet/record.
- **Features:** every row links `before`/`after` state where applicable, so
  a manager can see exactly what changed, not just that it did.
- **Data displayed:** actor, action, entity, timestamp, before/after on
  expand.
- **Error states:** none — read-only, no destructive actions exist here.
- **Empty states:** brand-new org — "no activity yet."
- **Future improvements:** anomaly highlighting (e.g. unusual after-hours
  activity), CSV/PDF export for compliance.

## 15. Reports

- **Purpose:** roll-up metrics for the ops-exec persona and pilot
  case-study evidence.
- **Who uses it:** manager (primary consumer: the exec persona, "Raj," via
  the manager sharing/exporting).
- **Wireframe:**
```
+--------------------------------------------------+
| Reports            Date Range: [Last 30 Days v]     |
+--------------------------------------------------+
| Discrepancies Caught: {14}   Avg Time to Receive: {2m}|
| Exception Rate: {6%}          Approval Backlog: {3}   |
|                                                        |
| Discrepancies by Type (chart)                          |
| Expected vs Received by Project (chart)                |
|                                                        |
| [ Export Discrepancy Report ]                          |
+--------------------------------------------------+
```
- **Buttons:** date range, export.
- **Inputs:** date range, warehouse/project filter.
- **Navigation:** from dashboard nav.
- **Features:** these are literally the metrics named in PRODUCT.md
  §Success Metrics — this screen exists to make the product's value
  provable, not to be a generic BI tool.
- **Data displayed:** discrepancy counts by type, expected-vs-received by
  project, exception rate, time-to-receive.
- **Error states:** insufficient data for a chart (show a message, not a
  broken chart).
- **Empty states:** no data yet in range.
- **Future improvements:** scheduled email reports, benchmark against prior
  period.

## 16. User Management

- **Purpose:** invite/manage the org's workers and managers.
- **Who uses it:** manager.
- **Wireframe:**
```
+--------------------------------------------------+
| Users                          [ + Invite User ]   |
+--------------------------------------------------+
| Name      Email              Role      Status       |
| Marcus     marcus@co.com      Worker    Active        |
| Diane      diane@co.com       Manager   Active        |
| J. Smith   jsmith@co.com      Worker    Invited        |
+--------------------------------------------------+
```
- **Buttons:** + Invite User, Deactivate, Resend Invite.
- **Inputs:** email, name, role (invite form).
- **Navigation:** from dashboard nav/Settings.
- **Features:** deactivate, never delete a user — their historical actions
  in the activity log must stay attributable.
- **Data displayed:** name, email, role, status.
- **Error states:** invite to an email already in another org (must not
  leak which org).
- **Empty states:** only the creating manager exists yet.
- **Future improvements:** per-warehouse access scoping, custom roles (V4).

## 17. Settings

- **Purpose:** org-level configuration.
- **Who uses it:** manager.
- **Wireframe:**
```
+-----------------------------+
| Settings                       |
| Organization Name (text)       |
| Default Timezone [dropdown]    |
| AI Confidence Threshold (slider)|
|      [ Save ]                  |
+-----------------------------+
```
- **Buttons:** Save.
- **Inputs:** org name, timezone, confidence threshold.
- **Navigation:** from dashboard nav.
- **Features:** confidence threshold directly tunes when
  `low_ai_confidence` exceptions fire — a real lever, not decoration.
  **Notification Preferences was removed in the final architecture
  review** — V1 has no push-notification system for it to configure (that
  lands in V2), and a setting with no backing feature is worse than no
  setting at all. It returns to this screen when V2 notifications ship.
- **Data displayed:** current org config.
- **Error states:** invalid threshold range.
- **Empty states:** n/a.
- **Future improvements:** billing/plan management, branding, data export/
  deletion for compliance, notification preferences (V2).

---

# Worker App (mobile)

**Changes shipped in M2, superseding the entries below where they
conflict:**

1. **No separate "home" screen.** Scan Location *is* the post-login
   landing state — there is no menu, dashboard, or navigation stack a
   worker chooses from. `Receive Inventory (worker home)` below describes
   the original concept; the shipped app collapses it into Scan Location
   itself, matching the M2 brief's "workers should never need to navigate
   menus during a normal receiving workflow" literally, in the app's
   architecture, not just its visuals.
2. **Scan the location once per session, then loop.** The original
   step-by-step (scan → photo → confirm, implying once per pallet) is
   revised: after one location scan, Photograph → Review/Confirm repeats
   automatically for as many pallets as are actually at that location,
   with "Change Location" always one tap away. Recommended and built this
   way because most receiving is multi-pallet at one spot — re-scanning a
   QR code before every single pallet fails the M2 brief's own test ("if I
   were scanning 500 pallets today, would I enjoy this").
3. **AI Review Screen and Confirm Inventory are one screen, not two.**
   Splitting them was the original design; M2 merges them because a
   separate review screen is exactly what stands between "everything
   matched" and "one tap to confirm." The merged screen is close to
   invisible when clean (a one-line summary and a single Confirm button)
   and expands only for what's actually flagged — never a full
   field-by-field form nobody needed to see. See
   `docs/architecture/PLAN.md`'s M2 notes and
   `apps/mobile/src/screens/receiving/ReviewConfirmView.tsx`.
4. **"Log as Untracked" is a first-class action on this screen**, not a
   separate flow — when the PO can't be found, the worker sees exactly two
   buttons (Retake Photo / Log as Untracked), nothing else.

Screens 19-22 below are superseded by the single combined flow in
`apps/mobile/src/screens/receiving/` (`ScanLocationView`,
`PhotographView`, `ReviewConfirmView`, orchestrated by `ReceivingFlow`).
Kept here for the historical design rationale each screen's purpose
section still explains correctly — only the screen *boundaries* changed.

## 18. Receive Inventory (worker home)

- **Purpose:** the worker's landing screen — the fastest path into the
  core loop.
- **Who uses it:** worker.
- **Wireframe:**
```
+-----------------------------+
|  WarehouseIQ        {name}    |
|                                |
|   [  Scan Location  ]         |
|   [  Move Inventory  ]        |
|   [  Search Inventory ]       |
|                                |
|  Recent                        |
|  {Pallet} moved to {Location}  |
+-----------------------------+
```
- **Buttons:** Scan Location (primary/large), Move Inventory, Search.
- **Inputs:** none.
- **Navigation:** → Scan Location, Move Inventory, Search Inventory.
- **Features:** one dominant primary action — receiving is the job most of
  the time, so it gets the biggest button.
- **Data displayed:** worker's own recent actions.
- **Error states:** offline banner (V1 has no offline queue — see
  ROADMAP.md V2 — so this states plainly "no connection, try again").
- **Empty states:** first login — no recent activity yet.
- **Future improvements:** offline queueing, shift-based task list.

## 19. Scan Location

- **Purpose:** identify which location a pallet is being received into (or
  moved from/to), via QR.
- **Who uses it:** worker.
- **Wireframe:**
```
+-----------------------------+
|      Scan Location QR         |
|  +-----------------------+   |
|  |                       |   |
|  |     [ camera view ]   |   |
|  |                       |   |
|  +-----------------------+   |
|  Point camera at the location |
|  QR code                       |
+-----------------------------+
```
- **Buttons:** manual entry fallback (type location name) if the QR is
  damaged/unreadable.
- **Inputs:** camera stream; manual location search fallback.
- **Navigation:** success → Photograph Pallet (receive flow) or Move
  Inventory's destination step.
- **Features:** auto-detects QR in frame, no shutter press needed.
- **Data displayed:** resolved location name on successful scan.
- **Error states:** QR not recognized (not one of ours), QR belongs to a
  different warehouse than expected, camera permission denied.
- **Empty states:** n/a.
- **Future improvements:** NFC tap-to-scan as an alternative to camera QR.

## 20. Photograph Pallet

- **Purpose:** capture the image the AI will read.
- **Who uses it:** worker.
- **Wireframe:**
```
+-----------------------------+
|   {Location Name}              |
|  +-----------------------+   |
|  |                       |   |
|  |    [ camera view ]    |   |
|  |                       |   |
|  +-----------------------+   |
|  Tips: capture the full label |
|                                |
|        ( o )  <- shutter       |
+-----------------------------+
```
- **Buttons:** shutter, retake, use-photo.
- **Inputs:** camera capture (multi-photo allowed — label + wide shot).
- **Navigation:** → AI Review Screen (auto-advances after capture +
  extraction call).
- **Features:** on-screen framing guidance; allows a second photo if the
  label spans more than one angle.
- **Data displayed:** live camera preview, captured thumbnail.
- **Error states:** blurry-image warning before submitting, upload failure
  retry.
- **Empty states:** n/a.
- **Future improvements:** guided multi-angle capture for very large
  serial-number labels.

## 21. AI Review Screen

- **Purpose:** the worker checks the AI's extraction against what they can
  see, before anything is written to inventory. This is the safety
  checkpoint the entire product's credibility rests on.
- **Who uses it:** worker.
- **Wireframe:**
```
+--------------------------------------------------+
|  Review Extracted Data          {photo thumbnail}  |
+--------------------------------------------------+
|  Pallet ID     (P-9981)                        OK  |
|  PO Number     (PO-9999)            !NOT FOUND!     |
|  Manufacturer  (Acme)                           OK  |
|  Product       (Inverter X)                     OK  |
|  Quantity      (12)              [Please double-    |
|                                    check this]       |
|  Serials       (SN001, SN002, ... +10)       [expand]|
|  Project       Solar Farm A (P-101)   <- auto-filled |
|                 from matched PO, not editable here   |
|                                                      |
|  ! This PO wasn't found in Expected Inventory.       |
|    [ Retry Match ]   [ Log as Untracked ]            |
|                                                      |
|      [ Retake Photo ]      [ Continue ]              |
+--------------------------------------------------+
```
- **Buttons:** Retake Photo, edit any field inline, Retry Match (re-run the
  PO lookup, e.g. after correcting a misread PO number), **Log as
  Untracked** (new in the final architecture review), Continue (→ Confirm).
- **Inputs:** editable text field per extracted value.
- **Navigation:** → Confirm Inventory.
- **Features, revised in the final architecture review:**
  - **Project is not an AI-extracted field.** A manufacturer's label
    doesn't print an internal project name, so asking the AI to guess one
    produced an unreliable field with nothing real to check it against.
    Project is shown read-only, auto-filled from whichever Expected
    Inventory Record the PO number matched — it's information, not
    something the worker corrects here.
  - **No raw confidence percentages for workers.** A "93%" or "61%" badge
    is a data-science artifact, not warehouse language. Fields the AI is
    confident about show a plain OK; fields below the confidence threshold
    show a plain "please double-check this" prompt and are forced open for
    correction. The underlying numeric confidence score is still recorded
    and is visible to managers on Pallet Details/Reports, where it's
    actually useful for tuning the threshold.
  - **Log as Untracked:** if no Expected Inventory Record matches the PO
    (or there genuinely isn't one — an internal transfer, a spare part),
    the worker can proceed immediately without waiting on a manager. The
    pallet is still created and still fully traceable; it's flagged for a
    manager to review asynchronously rather than blocking the worker. This
    exists specifically so legitimate no-PO items don't flood the approval
    queue and cause managers to rubber-stamp real exceptions out of
    fatigue (see DATABASE.md §5).
  - **Continue is disabled** until every low-confidence field has been
    touched or confirmed, and until the unmatched-PO banner has been
    either resolved (Retry Match succeeds) or explicitly dismissed via Log
    as Untracked.
- **Data displayed:** every AI-extracted field and its review state;
  auto-filled project; any exception detected via a preliminary match
  against Expected Inventory.
- **Error states:** no matching Expected Inventory record found (routed to
  Log as Untracked, not a silent failure or a hard block); AI returned
  nothing usable (manual entry fallback for the whole pallet).
- **Empty states:** n/a.
- **Future improvements:** side-by-side photo zoom + field highlight (tap a
  field, see where on the photo it was read from).

## 22. Confirm Inventory

- **Purpose:** the final, explicit commit step — nothing is written to
  inventory without this.
- **Who uses it:** worker.
- **Wireframe:**
```
+-----------------------------+
|  Confirm Receiving             |
|  Pallet P-9981 -> Aisle 3/Bay 2 |
|  Project P-101, Qty 12          |
|                                 |
|  ! Requires manager approval    |
|    (Unknown PO)                 |
|    -- or --                     |
|  i Logged as Untracked --       |
|    a manager will review this   |
|                                 |
|      [ Confirm ]                |
+-----------------------------+
```
- **Buttons:** Confirm (single action — everything else was decided on the
  Review screen).
- **Inputs:** none.
- **Navigation:** success → Receive Inventory home, with a clear result
  state: "received," "logged as untracked — a manager will review this,"
  or "pending manager approval," never a bare generic success message.
- **Features:** calls `rpc/confirm_pallet_receipt` with the client-generated
  idempotency key from the Review screen, so a dropped connection and a
  resubmit can't create a duplicate pallet. If a blocking exception exists,
  the confirmation still submits but the worker is told plainly that it's
  now awaiting a manager, not silently accepted. If Log as Untracked was
  chosen, the worker is told the pallet is received and active immediately
  — untracked review never blocks the worker, only informs them it's
  visible to a manager.
- **Data displayed:** summary of what's about to be recorded.
- **Error states:** submission failure (retry, nothing partially written —
  the RPC is transactional).
- **Empty states:** n/a.
- **Future improvements:** e-signature-style confirmation for
  high-value/regulated customers.

## 23. Search Inventory

- **Purpose:** find a pallet by ID, project, PO, location, or product.
- **Who uses it:** worker (find inventory on the floor), manager (broader
  investigative search — same screen, manager additionally sees exception/
  approval status inline).
- **Wireframe:**
```
+-----------------------------+
|  (search pallets, PO, project) |
+-----------------------------+
|  {Pallet P-9981}  {Aisle 3/Bay2}|
|  Acme - Inverter X - Qty 12     |
|  {Pallet P-9975}  {Yard North} |
|  Acme - Battery Y - Qty 20      |
+-----------------------------+
```
- **Buttons:** filter chips (warehouse, project, lifecycle status), row tap
  → detail.
- **Inputs:** search text, filters.
- **Navigation:** → Pallet Details.
- **Features:** defaults to "In Stock" pallets only, per the lifecycle
  model added in this review — shipped/installed/consumed/scrapped pallets
  are hidden unless a filter explicitly includes them, since "where is
  this in my warehouse" shouldn't surface things that already left it.
  V1 is online-only; a brief network blip during a search retries
  automatically rather than failing outright (see PRODUCT.md's transient
  connectivity tolerance) — full offline search against a synced cache is
  V2.
- **Data displayed:** pallet ID, location, manufacturer/product/qty,
  lifecycle status, exception badge if any.
- **Error states:** no connection.
- **Empty states:** no results for query.
- **Future improvements:** barcode/serial-number search, saved searches.

## 24. Pallet Details

- **Purpose:** everything known about one pallet.
- **Who uses it:** worker (quick reference), manager (full audit view).
- **Wireframe:**
```
+--------------------------------------------------+
|  Pallet P-9981                     {photo thumb}   |
+--------------------------------------------------+
| Project: P-101   PO: PO-9999   Status: Pending Appr.|
| Manufacturer: Acme   Product: Inverter X   Qty: 12  |
| Current Location: Aisle 3 / Bay 2                    |
| Inventory Status: In Stock                            |
| Serials: SN001 (received) SN002 (received) ...       |
+--------------------------------------------------+
| <Inventory Timeline>   [ Move ]   [ Update Status v ] |
+--------------------------------------------------+
```
- **Buttons:** Move (→ Move Inventory), Update Status (→ Update Pallet
  Lifecycle — new in the final architecture review, see below), View
  Photo(s), (manager only) Approve/Reject if pending, Void.
- **Inputs:** none directly (edits go through explicit correction flows
  logged to `activity_log`).
- **Navigation:** → Inventory Timeline, → Move Inventory, → Update Pallet
  Lifecycle, → Expected Inventory Detail (via PO link).
- **Features:** single source of truth for a pallet — every other screen
  links here. "Inventory Status" (In Stock / Shipped / Installed /
  Consumed / Scrapped) is shown prominently since it now determines
  whether this pallet counts toward warehouse inventory at all.
- **Data displayed:** all pallet fields, current location, lifecycle
  status, serials, photo, linked expected record, receipt status.
- **Error states:** pallet voided (banner, read-only).
- **Empty states:** n/a (a pallet detail screen without a pallet doesn't
  exist).
- **Future improvements:** QR code re-print for a pallet-specific label.

## 26b. Update Pallet Lifecycle (Ship / Install / Consume / Scrap) — new screen, added in this review

- **Purpose:** close the gap where inventory that physically left the
  warehouse had no way to stop counting as "in stock" — a real limitation
  the original V1 model didn't address, and one your own founder story
  points at directly (project inventory eventually ships to a job site).
- **Who uses it:** worker (day-to-day) and manager.
- **Wireframe:**
```
+-----------------------------+
|  Update Status: P-9981         |
|  Currently: In Stock            |
|                                 |
|  New Status: [ Shipped v ]      |
|  Destination/Note (text)        |
|  Reason (text, required if       |
|          Scrapped)               |
|  [ Attach Photo (optional) ]     |
|                                  |
|      [ Confirm Status Change ]  |
+-----------------------------+
```
- **Buttons:** Confirm Status Change.
- **Inputs:** new status (Shipped/Installed/Consumed/Scrapped), destination
  note, reason (required for Scrapped), optional photo.
- **Navigation:** from Pallet Details; success → back to Pallet Details
  showing the updated status.
- **Features:** calls `rpc/record_lifecycle_event`; writes an immutable
  `pallet_lifecycle_events` row; the pallet's location history is never
  altered or cleared — only its inventory-count classification changes, so
  "where was this last seen" is always still answerable.
- **Data displayed:** current status, pallet identity.
- **Error states:** pallet already in a terminal state (blocked — a
  scrapped pallet can't later be marked Installed; if that happens in
  reality, it's a new pallet/correction event, not an edit to this one).
- **Empty states:** n/a.
- **Future improvements:** bulk status update for multiple pallets shipping
  together on one truck.

## 25. Move Inventory

- **Purpose:** relocate an existing pallet to a new location.
- **Who uses it:** worker.
- **Wireframe:**
```
+-----------------------------+
|  Move Pallet P-9981            |
|  From: Aisle 3 / Bay 2         |
|                                 |
|   [ Scan New Location ]        |
|                                 |
|  To: {scanned location}        |
|   [ Take Confirmation Photo ]  |
|                                 |
|      [ Confirm Move ]          |
+-----------------------------+
```
- **Buttons:** Scan New Location, Take Confirmation Photo, Confirm Move.
- **Inputs:** camera (QR scan, then confirmation photo).
- **Navigation:** entry either from worker home or from Pallet Details;
  success → Pallet Details showing updated location.
- **Features:** requires a photo at the new location too — every movement
  needs photo evidence, not just initial receiving.
- **Data displayed:** pallet identity, previous/new location.
- **Error states:** scanned location is the pallet's current location
  (no-op, blocked with a clear message); pallet already voided.
- **Empty states:** n/a.
- **Future improvements:** batch-move multiple pallets in one scan session
  (e.g. a whole rack getting relocated).

## 26. Inventory Timeline

- **Purpose:** the full, chronological, immutable history of one pallet.
- **Who uses it:** worker (context), manager (audit/dispute resolution).
- **Wireframe:**
```
+--------------------------------------------------+
|  Timeline — Pallet P-9981                          |
+--------------------------------------------------+
|  10:32am  Marcus   Received at Aisle 3/Bay 2         |
|           {photo}   Confidence: Qty 61% (corrected)  |
|  11:15am  Diane    Approved (Unknown PO override)    |
|  2:40pm   Marcus   Moved: Aisle 3/Bay 2 -> Yard North|
|           {photo}                                    |
+--------------------------------------------------+
```
- **Buttons:** expand any entry for full photo/before-after detail.
- **Inputs:** none.
- **Navigation:** from Pallet Details.
- **Features:** every entry is a `pallet_movements`/`activity_log` row,
  rendered in order — this screen has no logic of its own beyond display,
  by design, since the ledger itself is the source of truth.
- **Data displayed:** every movement/event for the pallet, with actor,
  time, photo, and any exception/approval context.
- **Error states:** none — read-only.
- **Empty states:** newly created pallet — only the receiving event.
- **Future improvements:** side-by-side photo comparison across time.
