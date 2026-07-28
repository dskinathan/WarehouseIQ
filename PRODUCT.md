# WarehouseIQ — Product Bible

**Status:** V1 canonical reference. Every feature, screen, schema decision, and
milestone should be checked against this document before it's built. If a
proposed feature doesn't serve the mission below, it doesn't belong in V1.

---

## 1. Mission

Every company should know exactly what inventory they own, exactly where it
is, and immediately know when something is wrong.

## 2. Founder Story

The idea for WarehouseIQ came from an internship at Dimension Energy, working
closely with warehouse inventory supporting utility-scale solar projects.

The recurring problem: inventory became difficult to track after sitting in
long-term storage. Pallets moved, projects got mixed together, and staff fell
back on spreadsheets, Smartsheets, and manual audits just to answer "where is
this, and is the record still right?" The warehouse management systems and
spreadsheets in use stored information — but none of them *independently
verified* that the physical warehouse actually matched the digital record.
Audits were slow, mistakes happened, and confidence in the inventory depended
entirely on manual process discipline.

That experience pointed at the real opportunity: not to replace the warehouse
software already in place, but to build an AI verification layer that
confirms the physical warehouse matches the digital record — the way a
second set of eyes would, except it never gets tired and it never forgets to
check.

WarehouseIQ lets a warehouse worker scan a storage location, photograph a
pallet, and let AI identify it, verify it against what was expected, record
its location, and surface discrepancies before they become expensive
problems.

The initial focus is project-based inventory — solar modules, transformers,
batteries, construction materials — because that's the problem we watched
happen firsthand. The long-term vision is broader: an AI verification
platform for any industry that stores high-value inventory.

## 3. Problem Statement

Warehouses that store high-value, project-allocated inventory (energy,
construction, industrial equipment) run on a mix of ERPs, spreadsheets, and
manual audits. These systems record what *should* be there. None of them
independently confirm what's *actually* there. The gap between the two grows
silently — a pallet gets moved without an update, two projects' materials
get commingled, a partial shipment gets logged as complete — and it's usually
discovered at the worst possible time: during a customer audit, a compliance
review, or when a project needs a part that supposedly exists but can't be
found.

Physical inventory audits (manual counts, reconciliation against ERP
records) are slow, expensive, and only as good as the person doing them.
WarehouseIQ replaces "trust the spreadsheet" with "verify against reality,
continuously, at the moment inventory moves" — not once a quarter.

## 4. Product Vision

WarehouseIQ is the verification layer that sits between the physical
warehouse and whatever system of record a company already uses (SAP,
Oracle, NetSuite, Dynamics, Excel, Smartsheet, or nothing formal at all). It
does not ask a company to change how it manages inventory. It asks one
question, continuously and automatically: **does what's physically here
match what's supposed to be here?**

In V1, that "what's supposed to be here" is captured directly inside
WarehouseIQ as an **Expected Inventory Record** — entered manually or
imported from a CSV export of whatever system the customer already runs.
That's a deliberate placeholder for direct ERP integration (V2+), designed
from day one so the same record can later be populated by SAP, Oracle,
NetSuite, Dynamics, or Smartsheet without a schema change — see
`DATABASE.md` §Expected Inventory.

## 5. Target Customers

- Companies with project-allocated, high-value physical inventory sitting in
  one or more warehouses/laydown yards for extended periods before
  deployment — the initial wedge is **utility-scale solar/energy
  developers and EPCs** (modules, inverters, transformers, batteries,
  racking, BOS materials).
- Adjacent beachheads with the same shape of problem: construction/
  infrastructure contractors, industrial equipment distributors, and
  telecom/data-center build-outs — anywhere inventory is expensive,
  project-tagged, and stored for months before use.
- Company profile: currently relies on Excel/Smartsheet plus tribal
  knowledge, or has an ERP/WMS that tracks *intended* state but no
  independent physical verification step.

## 6. User Personas

**Warehouse Worker — "Marcus"**
Works the floor. Receives shipments, moves pallets, fulfills project pulls.
Not going to type serial numbers off a nameplate by hand if he can help it,
may be wearing gloves, may have a phone but not a laptop mindset. Needs the
app to be faster than not using it — scan, photo, confirm, done. Anything
that feels like data entry is friction he'll route around.

**Warehouse Manager — "Diane"**
Owns inventory accuracy for the site(s). Sets up warehouses/projects/
locations, defines what's expected to arrive, and is the escalation point
when something doesn't match. Needs visibility without needing to walk the
floor: what's flagged, what's overdue, what's drifting. Ultimately
accountable if an audit finds a discrepancy — she is the one who has to
explain it to a customer or her own leadership.

**(V1 secondary, read-mostly) Company Owner / Ops Exec — "Raj"**
Cares about the roll-up: is inventory accuracy improving, what's the
exception rate, is this system paying for itself vs. manual audits. Not a
day-to-day user in V1, but the Reports screen exists for him.

## 7. Core Workflows

1. **Set up** — Manager creates the organization, warehouse(s), projects,
   locations, prints QR codes for each location.
2. **Set expectations** — Manager enters or imports what's expected to
   arrive (PO, manufacturer, product, quantity, serials if known).
3. **Receive** — Worker scans a location, photographs a pallet, AI extracts
   the pallet's data, WarehouseIQ matches it against an Expected Inventory
   Record and surfaces any mismatch, worker confirms (or escalates to
   manager approval if the mismatch is serious).
4. **Move** — Worker scans source pallet + destination location, confirms;
   an immutable movement record is written.
5. **Verify** — Manager reviews the activity log, open exceptions, and
   expected-vs-received status at any time, with full photo/who/when
   evidence behind every claim.

## 8. V1 Feature List

- Multi-tenant organizations with isolated data (§DATABASE.md)
- Auth + two roles: Worker, Manager
- Manager: Warehouses, Projects, Locations, QR generation
- Manager: Expected Inventory (manual entry + CSV import)
- Worker: scan location → photograph pallet → AI extraction → review →
  confirm (with exception detection against Expected Inventory)
- Worker: move inventory, search inventory, view pallet detail
- Manager: activity log, inventory/pallet history, exception & approval
  queue, warehouse dashboard, basic reports
- Append-only movement and activity history; nothing is ever deleted

## 9. V2+ Roadmap (see ROADMAP.md for full detail)

Direct ERP/WMS integrations (SAP, Oracle, NetSuite, Dynamics, Smartsheet)
populating Expected Inventory automatically; offline-first mobile; barcode
support; push notifications; richer role model; bulk operations.

## 10. Business Model

V1 is a **design-partner / pilot model**: priced per warehouse or per
active user per month, sold directly to operations leaders at target
customers (starting from the founder's own network in solar/energy). Not
optimizing for self-serve signup or a pricing page in V1 — optimizing for
2-5 pilot customers who'll give hands-on feedback and a case study. Pricing
model to formalize once a pilot proves time-saved / discrepancies-caught is
real and quantifiable — that number becomes the actual sales pitch later,
more than any feature list.

## 11. Competitive Positioning

- **vs. WMS platforms (SAP EWM, Manhattan, Oracle WMS):** we don't compete
  with them — we sit alongside them as a trust layer. A company doesn't rip
  out its ERP to adopt WarehouseIQ.
  Never enter negative selling ("your ERP is a waste of money") — the
  competitive story is "your ERP tells you what should be true, we tell you
  what's actually true," positioning the two as complementary line items.
- **vs. spreadsheets/Smartsheet:** WarehouseIQ isn't a better spreadsheet —
  it's what confirms the spreadsheet is still correct.
- **vs. barcode/RFID asset tracking:** those systems assume good data entry
  discipline; WarehouseIQ's AI-driven capture is built for the reality that
  discipline is inconsistent, and it independently double-checks.

## 12. Success Metrics

V1-stage metrics (pilot validation, not vanity metrics):
- **Discrepancies caught before they became a customer-facing problem** —
  the single number that proves the value prop.
- **Time to receive/move a pallet** (worker-side) — must be faster than or
  comparable to the manual process it replaces, or workers won't adopt it.
- **% of scans requiring manager approval** — a proxy for how "dirty" the
  customer's existing data/process is, and how much trust the AI extraction
  earns over time.
- **Pilot → paid conversion** and **qualitative case-study feedback**.

## 13. Long-Term Vision

Continuous, ambient verification that eventually requires no manual
scanning at all — fixed cameras, RFID, or robotic/drone-assisted scans
doing what a worker's phone does today. Expansion beyond project-based
energy/construction inventory into any industry storing high-value,
hard-to-audit physical assets. The end state: WarehouseIQ is the trust
layer any company's inventory system talks to, the same way a company's
bank reconciles against a ledger it doesn't control.

## 14. Design Philosophy

Modern, clean, minimal, enterprise-credible — but the real design test is
whether a warehouse worker with gloves on and a phone in bright sunlight can
use it one-handed without training. Every screen optimizes for the fewest
taps and the least typing, because the worker's job is moving pallets, not
running software. See `DESIGN.md` for the full system.
