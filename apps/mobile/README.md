# WarehouseIQ — Worker App

React Native + Expo + TypeScript (see `docs/architecture/PLAN.md` §3 for
the stack rationale). This is **M0 scaffolding only** — auth wiring and
project structure, no screens yet. The core loop (Scan Location →
Photograph Pallet → AI Review → Confirm, plus Move/Search/Lifecycle
updates) is built starting in M2, per `docs/product/SCREENS.md`.

## Setup

```
cp ../../.env.example .env   # fill in your Supabase project's URL/anon key
npm install
npm start
```
