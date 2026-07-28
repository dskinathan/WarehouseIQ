# WarehouseIQ — Roadmap (V1 → V5)

Each version exists to answer one question. If a feature doesn't serve that
version's question, it belongs in a later version, no matter how easy it
would be to add now.

---

## V1 — "Does the AI verification loop actually work, end to end, for one
customer's real warehouse?"

**Question it answers:** can a worker scan/photograph/confirm faster than
their current manual process, and does the system genuinely catch
discrepancies a spreadsheet-based process would have missed?

- Multi-tenant orgs, two roles (worker, manager)
- Warehouses, projects, locations, QR generation
- Expected Inventory (manual entry + CSV import) as the digital record
- AI-powered receive flow with confidence scoring and exception detection
- Move, search, pallet detail, immutable timeline
- Exception & approval queue, activity log, basic reports
- **Explicitly not in V1:** any real ERP integration, offline mode, barcode/
  RFID, push notifications, multi-org membership for a single user, custom
  roles/permissions beyond worker/manager.

## V2 — "Can we remove the manual-entry tax and work in a real warehouse's
connectivity/hardware conditions?"

**Question it answers:** does the product survive contact with a real
customer's existing systems and physical environment, without the founder
manually re-typing their PO list?

- Direct ERP/WMS integrations (SAP, Oracle, NetSuite, Microsoft Dynamics)
  and Smartsheet sync, populating `expected_inventory_records` with
  `source = erp_integration` — no schema change from V1, per DATABASE.md
  design.
- Offline-first mobile: local queue of scans/photos, sync + conflict
  resolution when connectivity returns (V1 warehouses may have dead zones).
- Barcode/1D code support alongside QR (some existing location labels may
  already be barcoded).
- Push notifications for managers on blocking exceptions (V1 requires them
  to check the queue manually).
- Richer role model: distinguish org Admin (billing/users) from Manager
  (day-to-day) if pilot feedback shows that's needed.
- Bulk operations (multi-pallet move, bulk approval).

## V3 — "Can the AI do more than read a label — can it help prevent
problems, not just record them?"

**Question it answers:** does this move from "verification tool" toward
"the system a warehouse manager trusts more than her own eyes"?

- Anomaly/trend detection: unusual movement patterns, aging inventory
  flags, shrinkage signals across time — not just per-scan checks.
- Damage/condition detection via vision (flag visibly damaged pallets at
  receiving, not just data mismatches).
- Multi-warehouse transfer workflows (moving a pallet between sites, not
  just within one).
- Customer-facing read-only portal (the client whose project the inventory
  belongs to can check status without a full account).
- Mobile offline queue maturity: conflict resolution UI, not just queueing.

## V4 — "Is this ready for enterprise procurement, not just a pilot deal?"

**Question it answers:** can WarehouseIQ pass an enterprise security/
compliance review and scale past a handful of design-partner customers?

- SSO/SAML + SCIM provisioning.
- Granular custom roles/permissions (beyond worker/manager).
- White-labeling for large customers/partners.
- Data residency options, SOC 2-aligned audit export.
- Versioned public API + webhooks for partner/integrator ecosystem — a thin
  wrapper over the same RPC functions from `API.md`, not a rebuild.

## V5 — "Can verification happen without a human doing the scanning at
all?"

**Question it answers:** does WarehouseIQ become ambient infrastructure
rather than an app a worker opens?

- Fixed-camera / RFID / IoT continuous verification — the location "checks
  itself" instead of waiting for a worker's scan.
- Drone/robot-assisted physical verification for large yards.
- Integration marketplace beyond the V4 partner API.
- Expansion beyond project-based energy/construction inventory into any
  industry storing high-value, hard-to-audit physical assets — the
  long-term vision stated in PRODUCT.md.

---

## Why this order

Integrations (V2) come before AI-does-more (V3) because V1's exception
detection is only as credible as the Expected Inventory data behind it —
manual entry/CSV works for a pilot, but real adoption depends on that data
being current, which means ERP sync has to land before we ask customers to
trust deeper AI judgment calls. Enterprise readiness (V4) comes after
product-market signal (V2/V3), not before, because building SSO/SAML for
zero paying enterprise customers is effort spent on a sale that doesn't
exist yet. V5 is deliberately last — it's the most technically ambitious
and the least proven market need until V1-V4 establish that customers trust
an AI system's judgment on their inventory at all.
