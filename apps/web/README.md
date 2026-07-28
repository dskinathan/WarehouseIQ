# WarehouseIQ — Manager Dashboard

Next.js + TypeScript + Tailwind/shadcn (see `docs/architecture/PLAN.md` §3
for the stack rationale). This is **M0 scaffolding only** — auth wiring and
project structure, no screens yet. Screens (Warehouses, Projects,
Locations, QR Generator, Expected Inventory, Exceptions Queue, Activity
Log, Reports, User Management, Settings) are built one at a time starting
in M1, per `docs/product/SCREENS.md`.

## Setup

```
cp ../../.env.example .env.local   # fill in your Supabase project's URL/anon key
npm install
npm run dev
```
