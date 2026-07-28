# WarehouseIQ — Investor Materials

---

## One-Sentence Elevator Pitch

WarehouseIQ is an AI verification layer that confirms a company's physical
warehouse actually matches its digital inventory records — without
replacing the ERP or spreadsheet they already use.

## 30-Second Pitch

Companies that store high-value, project-allocated inventory — solar
modules, transformers, construction materials — track it in an ERP or a
spreadsheet, but nothing independently confirms the physical warehouse
still matches that record. The gap grows silently until an audit,
compliance review, or missing part exposes it. WarehouseIQ lets a worker
scan a location, photograph a pallet, and have AI identify it, verify it
against what was expected, and flag discrepancies immediately — turning a
quarterly manual audit into a continuous, automatic check.

## 2-Minute Pitch

Every company with high-value physical inventory has the same blind spot:
their systems record what's *supposed* to be in the warehouse, but nothing
independently checks what's *actually* there. That gap is invisible until
it's expensive — a pallet moved without an update, two projects'
materials commingled in storage, a shipment logged as complete when it was
only partial. It surfaces during a customer audit, a compliance review, or
worse, when a project team goes looking for a part that's supposed to
exist and can't find it.

WarehouseIQ closes that gap without asking anyone to change how they run
their warehouse. A worker scans a location's QR code, photographs a
pallet, and AI reads the label — pallet ID, PO number, manufacturer,
product, quantity, serial numbers. WarehouseIQ checks that against an
expected record (entered manually today, imported from SAP/Oracle/
NetSuite/Excel/Smartsheet tomorrow) and immediately flags anything that
doesn't match: wrong project, quantity mismatch, an unexpected item, a
receipt that would exceed what was ordered. Every action — every move,
every confirmation — is recorded permanently, with who, when, and a photo,
in a ledger that's structurally impossible to quietly edit.

We're starting where this problem is most acute: utility-scale solar and
energy project inventory, informed directly by hands-on experience
watching this exact failure mode at Dimension Energy. The wedge is narrow
on purpose. The long-term vision is broad: an AI verification layer for any
industry storing high-value, hard-to-audit physical inventory — eventually
requiring no manual scanning at all, as ambient verification (fixed
cameras, RFID, robotics) takes over what a worker's phone does today.

## Problem

Physical inventory audits are slow, expensive, and only as reliable as the
person doing them. The systems of record — ERPs, WMS platforms,
spreadsheets — store intent, not ground truth, and none of them
independently verify that the warehouse floor still agrees with the
database. In project-based industries (energy, construction, industrial
equipment), inventory sits in long-term storage for months before
deployment, which is exactly when it drifts: pallets get moved without
updates, projects' materials get commingled, partial shipments get logged
as complete. The mismatch is discovered at the worst possible time.

## Solution

An AI verification layer, not a replacement system. Workers scan and
photograph; AI extracts structured data; WarehouseIQ checks it against an
expected record and flags discrepancies before they're accepted into
inventory. Every action is permanently, verifiably logged. It installs
alongside whatever a customer already runs — the sales motion is "add a
trust layer," not "rip and replace."

## Founder Story

The idea came from an internship at Dimension Energy, working closely with
warehouse inventory supporting utility-scale solar projects. Inventory
became difficult to track after sitting in long-term storage — pallets
moved, projects got mixed together, and staff fell back on spreadsheets,
Smartsheets, and manual audits just to answer "where is this, and is the
record still right?" The tools in use stored information but never
independently verified it against reality. That gap — not a missing
feature in the ERP, but a missing verification layer entirely — is what
WarehouseIQ exists to close.

## Market Opportunity

The initial wedge — utility-scale solar/energy developers and EPCs — sits
inside a rapidly growing capital deployment cycle (module/inverter/
battery/racking procurement for utility-scale projects), where inventory
value per warehouse is high and the cost of a discrepancy (a missing
part delaying a project milestone) is disproportionately expensive
relative to the cost of verifying it. Adjacent beachheads with the
identical shape of problem — construction/infrastructure contractors,
industrial equipment distributors, telecom/data-center build-outs — expand
the addressable market well beyond the initial vertical without requiring
a different product, only different customer conversations.

## Target Customers

Companies with project-allocated, high-value physical inventory stored for
extended periods before deployment, currently relying on Excel/Smartsheet
plus tribal knowledge, or an ERP/WMS that tracks intended state with no
independent physical verification step.

## Business Model

V1 is a design-partner / pilot model: priced per warehouse or per active
user per month, sold directly to operations leaders, starting from the
founder's own network in solar/energy. Pricing formalizes once pilot data
proves time-saved and discrepancies-caught in hard numbers — that
becomes the actual sales pitch, not a feature list.

## Competitive Advantages

- **Positioning, not just technology:** we deliberately don't compete with
  SAP/Oracle/WMS platforms — we sit alongside them, which removes the
  single biggest objection ("we already have a system") before it's
  raised.
- **AI-native capture** where barcode/RFID asset tracking assumes data-
  entry discipline that real warehouses don't reliably have.
- **A verifiably tamper-evident audit trail** (hash-chained, append-only)
  as a first-class product property, not an afterthought — this is the
  actual product being sold to a company that has to explain its inventory
  accuracy to a customer or auditor.
- **Founder-market fit:** the problem was observed firsthand in the exact
  industry being targeted first.

## Why Now

Vision-capable LLMs (Claude, GPT-4V-class models) only recently became
reliable enough to extract structured, multi-field data from messy,
inconsistent real-world labels — the exact capability this product depends
on didn't exist at production quality even two years ago. Separately,
utility-scale energy build-out is accelerating procurement volume in
exactly the vertical this starts in, making the cost of inventory
discrepancies higher and more visible than ever.

## Go-To-Market Strategy

Founder-led sales into a direct professional network in solar/energy,
starting with 2-5 design-partner pilots that trade early access and
influence over the roadmap for hands-on feedback and a case study. Expand
by reference and case study — "here's exactly what we caught and what it
would have cost" — into adjacent verticals (construction, industrial
equipment, telecom/data-center) once the core loop is proven. No paid
acquisition, no self-serve motion, until there's a quantified value story
to sell against.

## Long-Term Vision

Continuous, ambient verification that eventually requires no manual
scanning — fixed cameras, RFID, or robotic/drone-assisted checks doing what
a worker's phone does in V1. Expansion beyond project-based energy/
construction inventory into any industry storing high-value, hard-to-audit
physical assets. End state: WarehouseIQ becomes the trust layer any
company's inventory system talks to, the way a bank reconciles against a
ledger it doesn't itself control.

## Risks

- **AI extraction accuracy on messy real-world labels** — mitigated by
  mandatory human review before anything is committed, and by V1's
  confidence-threshold gating; the product is designed to be useful even
  at imperfect AI accuracy because a human always confirms.
- **Adoption friction on the warehouse floor** — mitigated by a
  scan-first, type-last UX; the biggest execution risk is real and named
  explicitly rather than assumed away (see PRODUCT.md/DESIGN.md).
- **Sales cycle length in industrial/enterprise buyers** — mitigated by
  starting with pilot-priced design partnerships rather than a full
  enterprise sales motion before there's proof.
- **Dependency on a third-party AI provider (Claude)** — mitigated
  architecturally: the extraction call is isolated behind a single Edge
  Function, so swapping or ensembling providers never touches client code.
- **"Why won't the customer's ERP vendor just build this"** — addressed
  directly in the FAQ below.

## Frequently Asked Investor Questions

**Q: Why won't SAP/Oracle/a WMS vendor just build this themselves?**
A: They could, but it's not their incentive — their business is selling
the system of record, not admitting it needs an independent auditor. It's
a structurally awkward feature for an incumbent to prioritize, the same
way accounting software doesn't rush to build its own external audit
function. That's also exactly why our positioning is "alongside," not
"instead of" — we're not asking a customer to bet against their existing
vendor relationship to try us.

**Q: What stops a customer from just doing this manually, like they do
today?**
A: Nothing stops them — that's the status quo we're replacing, and the
entire pitch is that manual/periodic audits are slow, expensive, and only
as good as the person doing them. The value proposition has to be proven
in dollars (discrepancies caught, time saved) per pilot, which is exactly
what V1's Reports screen and success metrics are built to produce.

**Q: Is this really defensible, or can a competitor copy the idea?**
A: The idea is copyable; the trust is not. The product's entire value
depends on customers believing the audit trail is real and untamperable —
that's a reputation and design discipline advantage that compounds with
every pilot that goes well, not a patent-shaped moat. Founder-market fit
and being first with real pilot data in this specific vertical are the
early moat; the ambient-verification long-term vision (V5) is the
durable one.

**Q: How big can this actually get?**
A: Bounded initially by the energy/construction/industrial-equipment
verticals, but the underlying capability — verify physical reality against
a digital record using AI — generalizes to any industry with expensive,
hard-to-audit physical inventory. The long-term vision is deliberately
platform-shaped, not vertical-shaped.

**Q: What's the unit economics story with an LLM in the critical path?**
A: Every AI call is isolated behind one server-side function specifically
so cost and provider choice can be tuned centrally — rate-limited per user
from V1 onward, and the architecture supports swapping to a
cheaper/faster model per field-extraction task without any client-side
change, once volume makes that optimization worth doing.
