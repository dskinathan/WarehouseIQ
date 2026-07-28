# WarehouseIQ — First End-to-End Test Plan

This is not a features document. Everything referenced here already
exists (M0-M2). This is the exact sequence to get it running against a
real Supabase project and into a real warehouse for the first time.

Companion document: `DEPLOYMENT.md` (dev/staging/production strategy —
read that first if you're setting up more than a one-time pilot test).

---

## 1. Deploy WarehouseIQ to a real Supabase project

1. Create a Supabase account and a new project at supabase.com (pick a
   region close to the pilot warehouse, since every scan round-trips
   there).
2. Install the Supabase CLI locally: `npm install -g supabase`.
3. From the repo root: `supabase login`, then `supabase link --project-ref <your-project-ref>`
   (the project ref is in the Supabase dashboard's project URL/settings).
4. Apply the schema, **in order, skipping `0000`**:
   ```
   for f in supabase/migrations/000{1,2,3,4,5,6,7,8,9}_*.sql \
            supabase/migrations/00{10,11,12,13,14}_*.sql; do
     supabase db execute -f "$f"
   done
   ```
   (`0000_local_dev_auth_stub.sql` is explicitly not part of this list —
   see its header comment. It exists only for the bare-Postgres harness
   used to test M0-M2 without a live Supabase project; running it against
   a real one would conflict with Supabase's own `auth` schema.)
5. **Do not run `supabase/seed.sql`** — it's a test fixture with
   hardcoded fake UUIDs and emails (`diane@acme-solar.example`, etc.),
   built for the automated acceptance tests, not a real organization. Real
   data starts with step 9 below.
6. Confirm the `pallet-photos` Storage bucket and its two policies exist
   (migration `0014`). If you applied migrations via the loop above,
   they're already there — verify in Dashboard → Storage.
7. In Dashboard → Authentication → Providers → Email: for the pilot,
   consider turning **off** "Confirm email" so the first signup doesn't
   require clicking a confirmation link (Supabase's built-in email
   sending is rate-limited and easy to land in spam — fine to leave
   disabled for a pilot, but see `DEPLOYMENT.md` for the production
   recommendation to configure real SMTP instead).

## 2. Environment variables

| App | File | Variables |
|---|---|---|
| `apps/web` | `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `apps/mobile` | `.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Edge Functions | Supabase secrets (not a file) | `ANTHROPIC_API_KEY` only — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into every Edge Function's environment by Supabase; do not set them yourself. |

Find the URL and anon key in Dashboard → Project Settings → API. Copy
`.env.example` at the repo root as a starting point for both app `.env`
files.

## 3. Services that must be connected

- **Supabase** (Postgres, Auth, Storage, Edge Functions) — the entire backend.
- **Anthropic API** (Claude Vision) — powers `extract-pallet`.
- **Expo** account (free) — required to run the mobile app at all, and
  required for EAS Build if you want a persistent install (§8, Option B).
- **Apple Developer Program** ($99/year) — only required if you want a
  persistent TestFlight/App Store install (§8, Option B). Not required
  for the fastest path (§8, Option A, Expo Go).
- **Vercel** (or any Next.js host) — only needed once the manager
  dashboard needs to be reachable by someone other than you on your own
  machine; not required to run the first test locally.

## 4. API keys required

- **Supabase anon key** — public, safe in client apps, goes in both
  `.env` files above.
- **Supabase service role key** — needed only for CLI/admin operations
  (`supabase link`, manual SQL against the dashboard's SQL Editor). It is
  **never** used inside app code or Edge Function code in this codebase —
  don't put it in either `.env` file.
- **Anthropic API key** — create one at console.anthropic.com, set it as
  an Edge Function secret:
  ```
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  ```
- **Apple Developer account credentials** — only for §8 Option B.

## 5. Deploy the Edge Functions

```
supabase functions deploy extract-pallet
```

Sanity-check it's reachable (expect a `401` here, since no auth token was
sent — that's success, it means the function is live and checking auth):

```
curl -i https://<project-ref>.supabase.co/functions/v1/extract-pallet \
  -H "Content-Type: application/json" -d '{"photo_storage_path":"test"}'
```

**Known limitation, stated plainly:** `extract-pallet` was written to the
real Supabase/Deno/Anthropic contract but has never been invoked against
a live Claude API from this codebase's own testing — the environment it
was built in had no Anthropic key or Deno runtime. This deploy step is
the first time it will actually run. Budget time in the test session for
debugging a real API response shape mismatch if one surfaces.

## 6. Launch the web application

```
cd apps/web
cp ../../.env.example .env.local   # fill in the two NEXT_PUBLIC_ values
npm install
npm run dev
```

Open `http://localhost:3000` — it redirects to `/login` (no session yet).

For something reachable by a manager who isn't at your machine: `npm run build && npm start`,
or deploy to Vercel (`vercel --prod` from `apps/web`, same environment
variables set in Vercel's project settings instead of `.env.local`).

## 7. Launch the Expo mobile application

```
cd apps/mobile
cp ../../.env.example .env   # fill in the two EXPO_PUBLIC_ values
npm install
npx expo start
```

This prints a QR code in the terminal and opens Expo's dev tools in a
browser. If the warehouse's Wi-Fi has client isolation (common on
corporate/guest networks — very possibly the case at a real warehouse),
plain LAN discovery will fail silently; use:

```
npx expo start --tunnel
```

instead, which routes through Expo's relay and works on any network at
the cost of slightly higher latency reloading the app.

## 8. Install the mobile app onto an iPhone

**Option A — fastest, recommended for this first test:**
1. Install **Expo Go** from the App Store (free, no Apple Developer
   account needed).
2. With `npx expo start` (or `--tunnel`) running, open Expo Go and scan
   the terminal's QR code with the iPhone's camera.
3. The app loads directly. No code signing, no build step, no App Store
   review. This is genuinely the whole process — anything more elaborate
   is solving a problem you don't have yet for a one-time pilot test.

**Option B — persistent install, for an ongoing pilot beyond one test session:**
1. `npm install -g eas-cli`, then `eas login` (free Expo account).
2. Enroll in the Apple Developer Program if not already (apple.com/developer, $99/year).
3. `eas build:configure` from `apps/mobile` (interactive; generates `eas.json`).
4. `eas build --platform ios --profile preview` — builds in Expo's cloud,
   no local Xcode required.
5. Install via TestFlight (EAS can submit directly:
   `eas submit --platform ios`) or install the built `.ipa` ad-hoc (requires
   registering the test iPhone's UDID with Apple first).

For a single first test in a single warehouse, use Option A. Move to
Option B only once workers need the app across shifts without you
re-running `expo start` each time.

## 9. Create the first organization

1. Open the web app, go to `/signup`.
2. Enter company name, your name, work email, password → **Create Account**.
3. This calls `create_organization` (docs/api/API.md), which atomically
   creates the organization, your profile, and your manager membership.
   You land on `/dashboard` with an empty warehouse list.

## 10. Create the first warehouse

`/warehouses` → **+ New** → name, timezone, optional address → **Save**.
Click into it afterward — this is where locations and QR codes live.

## 11. Create the first project

`/projects` → **+ New** → project code (e.g. `P-101`), name, optional
client → **Save**. The code is what Expected Inventory and CSV imports
reference — see `docs/database/DATABASE.md` §2's design note on why it's
the single source of truth, not duplicated elsewhere.

## 12. Import Expected Inventory

Two paths — use whichever matches what the pilot customer already has:

**Manual** (a handful of POs): `/expected-inventory` → **+ New** → fill in
warehouse, project, PO number, manufacturer, product, expected quantity,
expected pallet count → **Save**.

**CSV import** (a real PO list export): `/expected-inventory` → **Import
CSV**. Example file the wizard's column mapping expects:

```csv
PO #,Line,Project,Mfr,Product,Qty,Pallets,Delivery Date
PO-4471,1,P-101,Acme Manufacturing,Inverter X,50,5,2026-08-15
PO-4471,2,P-101,Acme Manufacturing,Mounting Hardware,200,2,2026-08-15
PO-4488,1,P-101,Acme Manufacturing,Battery Y,20,2,
```

Upload → map each CSV column to the target field (Line/Delivery Date are
optional, everything else required) → **Validate** → review the
row-by-row preview (unknown project codes, bad numbers, and duplicates
against both the file and existing Expected Inventory all surface here,
before anything commits) → **Import Valid Rows**.

## 13. Print QR codes

Inside a warehouse's detail page: add locations (single or bulk pattern —
e.g. "Aisle" 1-10, "Bay" 1-5 generates the cartesian product), check the
boxes for the ones you want labels for, **Generate QR Codes**, then
**Print** in the popup (browser print dialog → print to your label
printer or a PDF). Each QR encodes a stable UUID — reprinting the same
location never changes what's encoded, so old labels never silently break.

## 14. Perform the first pallet scan

**You need a second (worker) account first — and this exposes a real
gap:** User Management/invite isn't built yet (that's M4). For this test,
create the worker account manually:

1. Dashboard → Authentication → Users → **Add User** (email + password,
   or send an invite email).
2. Copy the new user's UUID.
3. Dashboard → SQL Editor, run (replacing the placeholders — find your
   own `org_id` via `select id from organizations;`):
   ```sql
   insert into public.profiles (id, full_name)
   values ('<worker-uuid>', 'Worker Name');

   insert into public.memberships (user_id, org_id, role, status)
   values ('<worker-uuid>', '<org-id>', 'worker', 'active');
   ```
4. Log into the mobile app with that worker's email/password.
5. Scan a printed location QR code with the phone's camera → the app
   should recognize it and open the photo camera automatically.
6. Photograph a real pallet label → wait for "Reading pallet..." →
   the merged review/confirm screen appears.
7. If everything matches Expected Inventory: one summary card, one
   **Confirm** button. Tap it.
8. Confirm in the Supabase dashboard: a new row in `pallets`, a linked
   row in `pallet_movements`, and a photo in the `pallet-photos` Storage
   bucket under `{org_id}/...`.

## 15. Verify the AI extraction

For each of the first several real scans, manually compare the extracted
`pallet_label_id`/`po_number`/`manufacturer`/`product`/`quantity` (visible
on the review screen, or in `select * from pallets order by created_at desc limit 5;`)
against the physical label. This is the single most important thing to
observe in the first test session — everything else in the product
assumes this step is broadly reliable. Note every mismatch, not just the
ones that happened to trigger a flagged exception (Claude may be
confidently wrong in ways the confidence score didn't catch — that's
exactly the kind of signal that should inform the `ai_confidence_threshold`
setting and, longer-term, prompt tuning).

## 16. Test manager approvals

There's no Approval Queue screen yet (M4) — decisions are made directly
via SQL Editor for this test:

```sql
-- find what's waiting
select * from approval_requests where status = 'pending';

-- decide one (run as any authenticated manager session, or directly
-- here since SQL Editor runs with elevated privilege)
select decide_approval('<approval_request_id>', 'approved', 'test approval');
-- or: select decide_approval('<approval_request_id>', 'rejected', 'test rejection');
```

Verify: `pallets.receipt_status` flips to `approved`/`rejected`, and for
an approval on a matched pallet, `expected_inventory_records.received_quantity`
increments only now — not at the moment it was first received pending.

## 17. Intentionally create common warehouse mistakes

Run through each of these on purpose — this is the actual acceptance test
for the safety features the whole product exists to provide:

| Scenario | How | Expect |
|---|---|---|
| Duplicate pallet | Scan the same physical pallet (or a second one with the same label) twice | Second scan blocks: "This pallet already exists." Requires approval (§16). |
| Unknown PO | Scan a pallet whose PO isn't in Expected Inventory | "This purchase order could not be found." → Retake or **Log as Untracked**. |
| Log as Untracked | Same as above, tap Log as Untracked | Saves immediately, no approval needed — check `pallet_exceptions` shows a `warning`-severity `unexpected_pallet` row, not a pending approval. |
| Wrong manufacturer/product | Manually edit the extracted values before confirming (or find a mislabeled pallet) to not match the matched PO | Non-blocking warning shown inline; still confirms in one more tap. |
| Quantity mismatch | Enter a quantity far off the PO's per-pallet average | "Please verify quantity." warning, editable field shown. |
| Over-receipt | Enter a quantity that would exceed the PO's total expected | Blocks, requires approval. |
| Duplicate serial | Scan/enter a serial number already recorded on another pallet | Blocks: "One of these serial numbers already exists." |
| Low confidence | Photograph a damaged/blurry/handwritten label | "Please double-check this." on the affected field(s) — no percentage shown. |
| **Not currently testable, and that's expected:** `wrong_project` | — | This exception type exists in the schema for a future manual-override case, but the current design derives project from the matched PO rather than comparing an AI guess — see the final architecture review. It will not fire from the AI path today; that's correct behavior, not a bug. |

## 18. Pilot acceptance checklist

**Infrastructure**
- [ ] Migrations 0001-0014 applied (0000 excluded) to the real project
- [ ] `pallet-photos` bucket + policies exist and work (a real upload
      succeeds and is only visible to that org — spot-check in Dashboard → Storage)
- [ ] `extract-pallet` deployed and returns a structured result on a real photo
- [ ] `ANTHROPIC_API_KEY` set as an Edge Function secret
- [ ] Web app reachable (locally or deployed) with correct env vars
- [ ] Mobile app installed on the test iPhone and can log in

**Functional**
- [ ] Manager can create org, warehouse, project, Expected Inventory
      (manual and CSV) without errors
- [ ] QR codes print and scan correctly
- [ ] Worker can log in and reach the scan screen with no menu navigation
- [ ] A clean pallet (matches Expected Inventory) confirms in one tap
      after the photo
- [ ] Every scenario in §17 produces the correct, plain-language message
      and correct blocking/non-blocking behavior
- [ ] Manager approval/rejection (via SQL, §16) correctly updates pallet
      status and Expected Inventory counters
- [ ] A tampering attempt on `pallet_movements` (direct SQL `UPDATE`) is
      rejected even for a superuser-equivalent dashboard session — this is
      the product's core trust claim; worth actually trying once

**Real-world conditions (the part that can't be verified from a laptop)**
- [ ] Camera/QR scanning works reliably in the warehouse's actual lighting
- [ ] App usable one-handed, with gloves on
- [ ] A full scan-to-confirm cycle feels close to the "under 10 seconds"
      target for a clean pallet
- [ ] Photo upload survives the warehouse's actual Wi-Fi/cell conditions
      (note any dead zones — full offline support is V2, not this pilot)
- [ ] AI extraction accuracy is acceptable on the customer's actual label
      stock, fonts, and condition (see §15 — track a real percentage, not
      a gut feeling)

**Go / no-go**
A pilot is ready to continue past this first session if every
Infrastructure and Functional box is checked and the AI extraction
accuracy (§15) is high enough that a worker isn't correcting most fields
by hand. If extraction accuracy is the blocker, that's a prompt/model
problem to solve before adding any more product surface — not a reason to
rush into M3.
