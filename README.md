# WarehouseIQ

An AI verification layer that confirms a company's physical warehouse
matches its digital inventory records — not a warehouse management system,
and not a replacement for the ERP/WMS/spreadsheet a customer already runs.

## Start Here

**[`MASTER_PRODUCT_SPEC.md`](./MASTER_PRODUCT_SPEC.md)** is the complete
blueprint — mission, product, architecture, security, roadmap, business
model, all in one document. Read this first.

## Documentation Map

Exhaustive, line-by-line detail behind each section of the master spec:

| Path | Contents |
|---|---|
| `docs/product/PRODUCT.md` | Mission, founder story, personas, workflows, business model — the product bible every decision traces back to. |
| `docs/product/SCREENS.md` | Every screen, wireframe, button, input, error/empty state. |
| `docs/architecture/PLAN.md` | Tech stack rationale, system diagram, milestone plan. |
| `docs/database/DATABASE.md` | Every table, column, relationship, RLS policy, and why it exists. |
| `docs/api/API.md` | Every RPC function and Edge Function — inputs, outputs, auth, security controls. |
| `docs/design/DESIGN.md` | The shared visual/interaction system for both apps. |
| `docs/roadmap/ROADMAP.md` | V1 through V5, and why features land where they do. |
| `docs/investor/INVESTOR.md` | Pitch material, market opportunity, risks, investor FAQ. |

## Status

Documentation complete through the final pre-M0 architecture review. Build
proceeds one milestone at a time (see `docs/architecture/PLAN.md` §6) —
each milestone ships something demoable and is reviewed before the next
begins.

## Repository Layout

```
/README.md                  you are here
/MASTER_PRODUCT_SPEC.md     the complete blueprint
/docs/product/               product bible + screen specs
/docs/architecture/          tech stack + milestone plan
/docs/database/              schema + RLS
/docs/api/                   RPC + Edge Function design
/docs/design/                 design system
/docs/roadmap/                V1-V5
/docs/investor/                pitch material
/supabase/                   database migrations (from M0 onward)
/apps/mobile/                 worker app, React Native + Expo (from M0 onward)
/apps/web/                    manager dashboard, Next.js (from M0 onward)
```
