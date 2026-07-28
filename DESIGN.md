# WarehouseIQ — Design System

The real design constraint isn't "looks enterprise-credible in a demo" — a
worker with gloves on, in bright warehouse light or direct sun in a yard,
holding a phone one-handed while the other hand is on a pallet, has to be
able to use this without training. Every rule below serves that constraint
first, "modern/clean/minimal" second — they usually agree, but when they
conflict, usability for the worker wins.

## 1. Visual Direction

Reference feel: Linear, Stripe Dashboard, Vercel — high-contrast neutral
surfaces, restrained color used only to mean something (status, action),
no skeuomorphic warehouse iconography (no fake wood-grain pallets, no
cartoon forklifts). The manager dashboard should look like professional
B2B software an investor has seen before and trusts; the worker app should
look like the fewest possible things to look at.

## 2. Color

- **Neutral base:** near-white surface / near-black text in light mode,
  true dark surface in dark mode — both supported, since a night-shift
  warehouse worker needs dark mode as a real feature, not an afterthought.
- **One brand accent** for primary actions/links only (e.g. a confident
  blue) — not sprinkled decoratively.
- **Status colors carry fixed, exclusive meaning across the whole product:**
  - Green — matched / confirmed / fully received / approved
  - Amber — warning-level exception / partially received / needs review
  - Red — blocking exception / rejected / over-receipt
  - Blue/neutral — informational / pending / awaiting action
- Never reuse a status color for decoration elsewhere (e.g. red is never
  "just a nice accent" on a button that isn't destructive/blocking) —
  consistency here is what lets a manager scan a screen and read status
  color before reading any text.

## 3. Typography

- One typeface family, system-native (San Francisco / Roboto / system-ui
  stack) — no custom font loading delay on a mobile app used in the field.
- Type scale: display (dashboard headers) / title (screen headers) / body
  / label / caption — five sizes, no more. Body text minimum 16px on
  mobile; never shrink body text to fit a layout.

## 4. Spacing & Layout

- 4px base unit, spacing scale of 4/8/12/16/24/32/48.
- Mobile: single-column, thumb-reachable primary actions anchored near the
  bottom third of the screen, not the top.
- Dashboard: consistent left nav + content area, no more than two levels
  of navigation depth to reach any screen in SCREENS.md.

## 5. Components

- **Buttons:** one primary (filled, accent color) per screen — if two
  actions compete for primary, that's a screen-design problem, not a
  styling one. Secondary actions are outlined/ghost.
- **Status pills/badges:** color + label together, never color alone (color
  blindness / bright-sunlight glare both defeat color-only signaling).
- **Cards/tables:** dashboard uses tables for dense manager data; mobile
  never uses a dense table — list-of-cards instead, one primary fact per
  row plus a status pill.
- **Forms:** label above field (not placeholder-as-label — placeholders
  disappear exactly when a worker needs to double check what they typed).
- **Modals:** used sparingly, only for true interruptions (blocking
  exception requiring immediate manager decision); never for routine flows
  like Confirm, which get their own screen instead.
- **Empty states:** always an explanation + a next action, never a bare
  "no data" — every empty state in SCREENS.md names its CTA explicitly.
- **Toasts/inline confirmation:** every write action confirms visibly
  (toast or state change) — silence after a tap reads as "did that work?"
  and erodes trust in a product whose entire pitch is trustworthiness.

## 6. Accessibility

- Minimum contrast ratio 4.5:1 for body text, 3:1 for large text/icons —
  checked against both light and dark surfaces, and against direct-sunlight
  glare conditions specifically (higher-than-minimum contrast preferred on
  the worker app).
- Minimum tap target 44x44px on mobile — gloved hands need more margin for
  error than a bare fingertip.
- No icon-only buttons without an accessible label (screen reader and
  tooltip both).
- Camera/scan screens include a non-visual fallback (manual entry) for any
  worker who can't use the camera flow in the moment.

## 7. Mobile Usability Principles

- Camera-first, typing-last: every worker flow defaults to scan/photo, and
  typing only appears where AI extraction genuinely can't (or to correct a
  low-confidence field).
- No screen requires two hands to complete.
- No destructive action is a single tap — Reject/Void require a
  confirmation step and, per DATABASE.md, are never actually deletions.
- Assume intermittent connectivity: every action gives immediate local
  feedback and a clear "still saving" / "failed, retry" state (true offline
  queueing is V2 — see ROADMAP.md — but V1's UI must never leave a worker
  unsure whether a confirm went through).

## 8. Enterprise Visual Direction (Manager Dashboard)

- Data density is a feature for the manager persona ("Diane") — she needs
  to scan a table of 50 expected-inventory rows quickly, so the dashboard
  favors information density the mobile app deliberately avoids.
- Every chart/number on Reports and the dashboards must be explainable in
  one sentence on hover/tap — no unlabeled sparkline mystery metrics.
- Print/export (QR sheets, discrepancy reports) must look correct as a
  printed/PDF artifact, not just on-screen — these leave the product and
  represent it in a customer's own audit files.
