# WarehouseIQ — Master Product Specification

This is the single blueprint: a professional engineer, designer, technical
co-founder, or investor should be able to understand the entire product —
what it is, why it exists, how it's built, and what's next — from this
document alone. Exhaustive line-by-line detail (every database column,
every wireframe) lives in `/docs` and is cross-referenced throughout; this
document is the complete map of the territory, not a stub pointing at it.

---

## 1. Executive Summary

WarehouseIQ is an AI verification layer that confirms a company's physical
warehouse matches its digital inventory records. It is not a warehouse
management system and does not replace one — it sits alongside whatever
ERP, WMS, or spreadsheet a customer already uses (SAP, Oracle, NetSuite,
Dynamics, Excel, Smartsheet) and answers one question continuously: *does
what's physically here match what's supposed to be here?* A warehouse
worker scans a location's QR code, photographs a pallet, and AI reads its
label — pallet ID, PO number, manufacturer, product, quantity, serial
numbers. WarehouseIQ checks that against an expected record and surfaces
any mismatch — wrong project, quantity discrepancy, an item that exceeds
what was ordered — before it's silently accepted into inventory. Every
action is permanently and verifiably logged. V1 targets utility-scale
solar/energy project inventory as the initial wedge, sold as a 2-5 customer
design-partner pilot, with a long-term vision of becoming the ambient trust
layer for physical inventory across any industry.

## 2. Founder Story

The idea for WarehouseIQ came from an internship at Dimension Energy,
working closely with warehouse inventory supporting utility-scale solar
projects. The recurring problem: inventory became difficult to track after
sitting in long-term storage. Pallets moved, projects got mixed together,
and staff fell back on spreadsheets, Smartsheets, and manual audits just to
answer "where is this, and is the record still right?" The warehouse
management systems and spreadsheets in use stored information — but none
of them independently verified that the physical warehouse actually
matched the digital record. Audits were slow, mistakes happened, and
confidence in the inventory depended entirely on manual process
discipline. That experience pointed at the real opportunity: not to
replace the warehouse software already in place, but to build an AI
verification layer that confirms the physical warehouse matches the
digital record — the way a second set of eyes would, except it never gets
tired and never forgets to check.

## 3. Mission

Every company should know exactly what inventory they own, exactly where
it is, and immediately know when something is wrong.

## 4. Vision

Continuous, ambient verification that eventually requires no manual
scanning at all — fixed cameras, RFID, or robotic/drone-assisted checks
doing what a worker's phone does in V1. Expansion beyond project-based
energy/construction inventory into any industry storing high-value,
hard-to-audit physical assets. WarehouseIQ becomes the trust layer any
company's inventory system talks to, the way a bank reconciles against a
ledger it doesn't itself control.

## 5. Problem Statement

Warehouses storing high-value, project-allocated inventory run on a mix of
ERPs, spreadsheets, and manual audits that record what *should* be there —
none of them independently confirm what's *actually* there. That gap grows
silently (an unlogged move, commingled projects, a partial shipment marked
complete) and surfaces at the worst possible time: a customer audit, a
compliance review, or a project team unable to find a part that's supposed
to exist. Manual physical audits are slow, expensive, and only as reliable
as the person doing them.

## 6. Product Overview

WarehouseIQ's core loop: a manager configures warehouses, projects, and
locations, and enters or imports **Expected Inventory Records** — the
"what's supposed to arrive" data that stands in for direct ERP integration
until V2. A worker scans a location QR, photographs a pallet, and a
server-side AI call (Claude Vision) extracts structured data. The system
matches that against an Expected Inventory Record, runs a fixed set of
exception checks, and either accepts the pallet automatically, requires
manager approval (for serious mismatches), or logs it as an untracked item
for asynchronous review (for legitimate no-PO items). Every movement and
every terminal lifecycle event (shipped/installed/consumed/scrapped) is
written to an append-only, hash-chained ledger that cannot be edited by
any role, including managers.

## 7. Competitive Positioning

- **vs. WMS/ERP platforms (SAP EWM, Manhattan, Oracle WMS):** complementary,
  not competitive — "your ERP tells you what should be true, we tell you
  what's actually true." Never negative-sell the incumbent; the sale
  depends on not requiring a customer to bet against an existing vendor
  relationship.
- **vs. spreadsheets/Smartsheet:** not a better spreadsheet — what confirms
  the spreadsheet is still correct.
- **vs. barcode/RFID asset tracking:** those assume consistent data-entry
  discipline; WarehouseIQ's AI-driven capture is built for the reality that
  discipline is inconsistent, and independently double-checks regardless.

## 8. Target Customers

Companies with project-allocated, high-value physical inventory sitting in
warehouses/laydown yards for extended periods before deployment. Initial
wedge: utility-scale solar/energy developers and EPCs (modules, inverters,
transformers, batteries, racking, BOS materials). Adjacent beachheads with
the identical problem shape: construction/infrastructure contractors,
industrial equipment distributors, telecom/data-center build-outs. Company
profile: currently on Excel/Smartsheet plus tribal knowledge, or an ERP/WMS
with no independent physical verification step.

## 9. User Personas

- **Warehouse Worker ("Marcus")** — floor operator, receives/moves/pulls
  inventory, not going to hand-type data if avoidable, needs the app faster
  than the manual process or he'll route around it.
- **Warehouse Manager ("Diane")** — owns inventory accuracy, sets up the
  system, is the escalation point for mismatches, accountable to a
  customer or her own leadership if an audit finds a discrepancy.
- **Company Owner/Ops Exec ("Raj")** — V1 secondary/read-mostly persona,
  cares about the roll-up (accuracy trend, exception rate, ROI vs. manual
  audits) via the Reports screen.

## 10. Core Workflows

1. **Set up** — Manager creates the org, warehouse(s), projects, locations;
   prints QR codes.
2. **Set expectations** — Manager enters or CSV-imports Expected Inventory
   Records (PO, manufacturer, product, quantity, serials if known).
3. **Receive** — Worker scans a location, photographs a pallet; AI extracts
   PO/manufacturer/product/quantity/serials (never "project" — that's
   derived from the matched PO); WarehouseIQ matches against Expected
   Inventory and surfaces any mismatch; worker confirms, or logs as
   untracked if there's genuinely no matching PO.
4. **Move** — Worker scans source pallet + destination location, confirms;
   an immutable, hash-chained movement record is written.
5. **Ship / Install / Consume / Scrap** — worker or manager records the
   pallet's terminal lifecycle event so it stops counting as in-stock
   without erasing its history.
6. **Verify** — Manager reviews the activity log, the split
   approvals/review exceptions queue, and expected-vs-received status at
   any time, with full photo/who/when evidence behind every claim.

## 11. Complete Feature List (V1)

- Multi-tenant organizations, isolated via RLS, modeled as user↔org
  memberships (not a single org-per-user column) so multi-org access needs
  no future migration
- Auth with two roles: Worker, Manager
- Manager: Warehouses, Projects, Locations, QR code generation
- Manager: Expected Inventory — manual entry + CSV import (upload → column
  mapping → validation preview → row-level error correction → partial
  commit), keyed to support multi-line-item POs
- Worker: scan location → photograph pallet → AI extraction → review
  (plain-language status, not raw confidence numbers) → confirm, with
  exception detection against Expected Inventory and a non-blocking "Log
  as Untracked" path
- Worker: move inventory, search inventory (defaults to in-stock only),
  view pallet detail, record a pallet's lifecycle event (Shipped /
  Installed / Consumed / Scrapped)
- Manager: activity log, pallet history/timeline, an exceptions queue
  split into blocking approvals vs. non-blocking review items, warehouse
  dashboard, basic (table-first, not chart-heavy) reports, user management,
  settings (org name, timezone, AI confidence threshold)
- Append-only, hash-chained movement/lifecycle/activity ledger — nothing
  is ever deleted, and tampering is detectable even with elevated database
  access
- Idempotency keys and row-level locking on the write paths that matter
  (receiving, moving) to survive flaky connections and concurrent receipts
  without data corruption
- Transient local retry buffer for photo/confirm actions — tolerates brief
  connectivity gaps (common in steel-sided warehouses); not full offline
  support

## 12. V1 Scope (explicit boundary)

**In scope:** everything in §11.
**Explicitly out of scope, and why:** custom OCR model training (Claude
Vision handles structured extraction); full offline-first sync with
conflict resolution (V2 — a transient retry buffer covers V1's real need);
barcode/RFID/IoT (V2/V5); push notifications (V2 — the exceptions queue is
pull-based in V1); an org-switcher UI (V2 — schema supports it, UI doesn't
exist yet); direct ERP/WMS integrations (V2 — manual/CSV Expected Inventory
is the deliberate interim); SSO/SAML, custom roles, compliance
certifications, cryptographic external anchoring of the audit ledger (V4);
damage/condition detection via vision, predictive analytics (V3); ambient/
IoT/robotic verification (V5).

## 13. V2 Roadmap

Direct ERP/WMS integrations (SAP, Oracle, NetSuite, Dynamics, Smartsheet)
populating Expected Inventory automatically via `source = erp_integration`
— no schema change from V1. Full offline-first mobile with multi-day
queueing and conflict resolution. Org-switcher UI (schema-ready since V1).
Barcode/1D code support alongside QR. Push notifications for managers.
Richer role model (org Admin vs. Manager). Bulk operations (multi-pallet
move/approval/lifecycle update). Optional opt-in photo-GPS location
verification. A reconciliation job for Expected Inventory's denormalized
counters.

## 14. V3+ Long-Term Vision

**V3:** anomaly/trend detection across time (not just per-scan checks),
damage/condition detection via vision, multi-warehouse transfer workflows,
a customer-facing read-only portal, offline-queue conflict-resolution UI
maturity. **V4:** SSO/SAML + SCIM, granular custom roles, white-labeling,
data residency options, SOC 2-aligned audit export, a versioned public
partner API/webhooks, and cryptographic anchoring of the V1 hash-chained
ledger. **V5:** fixed-camera/RFID/IoT continuous verification, drone/robot-
assisted physical verification, an integration marketplace, and expansion
beyond project-based energy/construction inventory into any industry
storing high-value, hard-to-audit physical assets.

## 15. Screen Specifications (summary)

Full wireframes, buttons, inputs, error/empty states: `/docs/product/SCREENS.md`.
26 screens across three groups:

- **Shared:** Login, Create Company.
- **Manager Dashboard (web):** Manager Dashboard (home), Warehouse
  Dashboard, Warehouse Setup, Project Management, Location Management, QR
  Code Generator, Expected Inventory List, Expected Inventory Detail,
  Create/Edit Expected Inventory Record, CSV Import Wizard, Exceptions &
  Approval Queue (split: blocking approvals vs. non-blocking review),
  Activity Log, Reports, User Management, Settings.
- **Worker App (mobile):** Receive Inventory (home), Scan Location,
  Photograph Pallet, AI Review Screen, Confirm Inventory, Search Inventory,
  Pallet Details, Move Inventory, Update Pallet Lifecycle (Ship/Install/
  Consume/Scrap), Inventory Timeline.

Screens cut from V1 during the final architecture review: a standalone CSV
Import History screen (folded into Expected Inventory List's inline
source/timestamp), Settings' Notification Preferences (no backing feature
until V2), Warehouse Dashboard's occupancy heatmap (simplified to a list).

## 16. Database Design (summary)

Full schema, every column, every RLS policy: `/docs/database/DATABASE.md`.

- **Tenancy:** `organizations`, `profiles`, `memberships` (user↔org join,
  supports multi-org membership without a future migration).
- **Warehouse structure:** `warehouses`, `projects` (carries the
  human-readable project code — never duplicated on Expected Inventory),
  `locations` (QR-encoded).
- **Expected Inventory:** `expected_inventory_records` (unique on `org_id,
  po_number, line_number` — supports multi-line-item POs and a schema-free
  V2 ERP sync), `expected_serial_numbers`, `csv_imports`/`csv_import_rows`.
- **Pallets:** `pallets` (independent `receipt_status`, `lifecycle_status`,
  `match_status` columns rather than one overloaded status field),
  `serial_numbers` (child table, not an array — scales to thousands per
  pallet), `pallet_photos` (EXIF-stripped on ingest).
- **The trust ledger:** `pallet_movements`, `pallet_lifecycle_events`,
  `activity_log` — append-only, insert-only grants, hash-chained
  (`prev_hash`/`row_hash`), carrying idempotency keys. `pallet_exceptions`
  (explicit `blocking`/`warning` severity) and `approval_requests` (only
  for `blocking` exceptions).

**Row-Level Security** reduces to one predicate per table:
`org_id = current_org_id()`. Ledger tables additionally have no
`UPDATE`/`DELETE` grant for any role, including managers — enforced at the
Postgres permission level, not just by policy.

## 17. API Design (summary)

Full detail: `/docs/api/API.md`. Three layers: direct PostgREST table
access (gated by RLS), Postgres RPC functions (transactional business
logic), and Edge Functions (external calls — Claude Vision, CSV parsing).

The most important function, `rpc/confirm_pallet_receipt`, runs the entire
receiving decision atomically: checks idempotency, routes to Log-as-
Untracked if requested, otherwise locks (`SELECT ... FOR UPDATE`) the
matched Expected Inventory row, derives `project_id` from that match, runs
every exception check, and either auto-accepts the pallet or creates an
`approval_requests` gate for blocking exceptions. `rpc/move_pallet` and the
new `rpc/record_lifecycle_event` follow the same idempotent, transactional
pattern. `rpc/decide_approval` is the manager-only approve/reject path.

## 18. Security Architecture

- **Tenant isolation:** RLS on every table, resolved from the caller's JWT
  via `current_org_id()` — no endpoint trusts a client-supplied `org_id`.
- **Ledger integrity:** insert-only grants (no `UPDATE`/`DELETE` for any
  role) plus a hash chain (`prev_hash`/`row_hash` per row, computed by a
  Postgres trigger) so retroactive tampering is mathematically detectable
  even by an actor with elevated database access — converting "we revoked
  the grant" from a configuration promise into a verifiable property.
- **Abuse/cost controls:** per-user rate limiting on `extract-pallet`
  (every call is a billable AI request); ownership checks on any storage
  path before it's used server-side.
- **Upload validation:** file-size and MIME-type limits on photo/CSV
  uploads; EXIF GPS metadata stripped from photos by default (a privacy
  default, not a technical necessity); CSV formula-injection sanitization
  on any data exported back to Excel/CSV.
- **Concurrency safety:** row-level locking during the Expected Inventory
  check-and-increment closes a race between two workers confirming near a
  PO's quantity limit simultaneously; idempotency keys on retry-prone
  writes prevent duplicate ledger rows from a flaky mobile connection.
- **Secrets:** AI provider keys and service-role credentials live
  server-side only (Edge Functions/environment config), never shipped to
  either client.

## 19. AI Architecture

A single server-side Edge Function (`extract-pallet`) calls Claude Vision
on a pallet photo and returns structured JSON — pallet ID, PO number,
manufacturer, product, quantity, serial numbers, and a per-field confidence
score. It deliberately does not attempt to extract "project," since a
manufacturer's label doesn't print an internal project code; project is
derived downstream from whichever Expected Inventory Record the PO number
matches. The function does no database writes itself (pure extraction, so
it's trivially retryable) and is isolated behind one interface specifically
so the underlying model can be swapped or ensembled later without touching
client code. Confidence scores gate the review flow (fields below
threshold are forced open for manual correction) but are shown to workers
only as a plain "please double-check this," never as a raw percentage —
that number is manager/reporting language, surfaced on Pallet Details and
Reports where it's actually actionable for tuning the threshold.

## 20. Design System (summary)

Full system: `/docs/design/DESIGN.md`. Reference feel: Linear/Stripe/
Vercel — high-contrast neutral surfaces, one brand accent, status colors
(green/amber/red/blue) with fixed, exclusive meaning across the whole
product, both light and dark mode. Mobile is camera-first, typing-last,
single-column, thumb-reachable primary actions, 44px minimum tap targets,
no icon-only buttons without a label. The dashboard favors information
density the mobile app deliberately avoids. Worker-facing copy is always
plain language — no raw confidence scores, no exposed exception codes or
enum values; managers see the precise technical detail.

## 21. Development Roadmap

One milestone at a time, each demoable end-to-end, review after each:
**M0** schema/RLS/auth foundations (multi-tenant, hash-chained ledger) →
**M1** Manager setup tools + Expected Inventory → **M2** worker receive
loop (AI + exception matching + Log as Untracked) → **M3** move/search/
detail/timeline/lifecycle → **M4** exceptions queue/activity log/warehouse
dashboard/reports → **M5** demo polish. Full V1–V5 milestone rationale:
`/docs/roadmap/ROADMAP.md`.

## 22. Business Model

V1 is a design-partner/pilot model: priced per warehouse or per active user
per month, sold directly to operations leaders, starting from the
founder's own network in solar/energy. 2-5 pilots trade early access for
hands-on feedback and a case study. Pricing formalizes once pilot data
proves discrepancies-caught and time-saved in real numbers.

## 23. Go-To-Market Strategy

Founder-led sales into a direct professional network in solar/energy;
expand by reference/case study into adjacent verticals (construction,
industrial equipment, telecom/data-center) once the core loop is proven.
No paid acquisition or self-serve motion until there's a quantified value
story. Full detail: `/docs/investor/INVESTOR.md`.

## 24. Future Integrations

SAP, Oracle, NetSuite, Microsoft Dynamics, Smartsheet — all designed to
populate the *same* `expected_inventory_records` table via
`source = erp_integration`, using the same PO/line-item structure and the
same matching logic already built for manual entry and CSV import. No
parallel system, ever — see DATABASE.md §3 and API.md §5.

## 25. Success Metrics

Discrepancies caught before they became a customer-facing problem (the
number that proves the value prop); time to receive/move a pallet (must
beat or match the manual process or workers won't adopt it); % of scans
requiring manager approval (a proxy for how clean the customer's existing
data/process is); pilot → paid conversion and qualitative case-study
feedback.

## 26. Known Risks

AI extraction accuracy on messy real-world labels (mitigated by mandatory
human review — the product is designed to be useful even at imperfect AI
accuracy); floor adoption friction (mitigated by scan-first, type-last UX,
but named explicitly as the biggest execution risk, not assumed away);
industrial/enterprise sales cycle length (mitigated by pilot pricing before
a full enterprise motion); single-vendor AI dependency (mitigated by
isolating the extraction call behind one function); steel-warehouse
connectivity dead zones (mitigated in V1 by a transient retry buffer, fully
addressed only in V2's offline-first work). Full detail with investor
framing: `/docs/investor/INVESTOR.md`.

## 27. Technical Decisions (index)

The full record of what was decided and why lives in `/docs/architecture/PLAN.md`
§7 and `/docs/database/DATABASE.md` §8. The headline decisions: multi-tenant
via a `memberships` join table (not a single org column); serial numbers as
a child table; Expected Inventory as the deliberate V1 stand-in for ERP
integration, keyed for multi-line-item POs; project derived from the
matched PO, never AI-guessed; a full inventory lifecycle
(Shipped/Installed/Consumed/Scrapped); a non-blocking Log-as-Untracked
path; a hash-chained, idempotent, row-locked ledger; plain-language
worker-facing status.

## 28. Open Questions

- Should V1's single active-org-per-session assumption be revisited sooner
  than V2 if an early pilot customer's staff turn out to need multi-org
  access immediately? (Schema already supports it — this is a UI
  prioritization question, not a technical blocker.)
- At what pilot volume does the cut Reports charts / CSV Import History /
  occupancy heatmap actually become worth building, versus staying cut
  indefinitely?
- Should the hash-chain be scoped per-organization instead of globally
  across the platform, if a future enterprise customer wants to verify
  their own chain independently without platform-wide context? (Currently
  global — see DATABASE.md §6 for the tradeoff.)
- What confidence threshold should ship as the V1 default, and should it be
  tunable per customer from day one or fixed until real data justifies
  making it configurable?
