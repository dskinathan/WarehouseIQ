# WarehouseIQ — Deployment Strategy

How WarehouseIQ should be deployed across development, staging, and
production. This is a documentation-only companion to `TEST_PLAN.md`
(which walks through the mechanics of a single deploy) — this file
explains the *shape* of the whole pipeline and why it's structured this
way. No new code or infrastructure is introduced here.

---

## The three environments, and why they're separate

Every environment gets its **own Supabase project**. Not a schema
namespace inside one project, not a feature flag inside one database — a
fully separate project, with its own Postgres instance, its own Storage
buckets, its own Auth users. This matters for one reason above all others:
**a bug in staging must never be able to touch production data**, and
Supabase's isolation boundary is the project, not anything finer-grained.
For a product whose entire pitch is "your inventory data is trustworthy,"
that boundary is not optional.

| | Development | Staging | Production |
|---|---|---|---|
| Supabase project | One per developer, or one shared dev project | One, shared | One, separate from staging |
| Web app | `npm run dev` locally | Vercel preview deployment | Vercel production deployment |
| Mobile app | Expo Go + `expo start` (`--tunnel` if needed) | EAS "preview" build, TestFlight internal group | EAS "production" build, TestFlight/App Store |
| Data | Fake/scratch — reset freely | Real-shaped but non-sensitive test data | Real customer data |
| Anthropic key | A key with a low spend cap | A separate key or the same dev key, low volume | Its own key, monitored spend |
| Who has access | Developers | Developers + the pilot customer's test users | The pilot customer's real users |

## Development

This is what M0-M2 were built and verified against: either a real
per-developer Supabase project, or (as this codebase's own history
shows) a bare local Postgres instance with the `0000_local_dev_auth_stub.sql`
stand-in for Supabase's `auth` schema, for testing schema/RLS/RPC logic
without needing network access to a live project at all. Use whichever is
faster for the change being made — schema/RLS/RPC work is often faster to
iterate on locally; anything touching Storage, Edge Functions, or real
Auth flows needs an actual Supabase project (local Postgres has no
`storage` schema, no GoTrue, no Edge Functions runtime).

No production secrets ever touch a developer machine's `.env` files —
development uses its own Anthropic key with a low spend cap specifically
so a runaway local loop can't produce a surprise bill.

## Staging

Staging exists to answer one question: **does this work against the real
stack (real Auth, real Storage, real Edge Functions, a real Claude call),
before a pilot customer sees it?** It is the environment `TEST_PLAN.md`'s
first end-to-end test actually runs against — a pilot's very first test
session **is** standing up staging, not a separate, disposable throwaway.

- Migrations: applied the same way as `TEST_PLAN.md` §1 describes, but
  through a repeatable script or (once there's more than one contributor)
  a CI step — not by hand every time, since staging is meant to be
  re-creatable, not precious.
- Web: a Vercel preview or dedicated staging deployment, environment
  variables set in Vercel's project settings (not committed anywhere).
- Mobile: an EAS "preview" build profile distributed to a small TestFlight
  internal-testing group — not Expo Go once more than the founder is
  testing, since Expo Go requires the tester to have the Expo Go app and
  the dev server (or tunnel) actively running, which doesn't scale past
  one person testing at a time.
- Data: shaped like production (real warehouses/projects/Expected
  Inventory structure) but populated with test organizations, not a real
  customer's actual inventory data.

## Production

- A dedicated Supabase project, on a paid tier once real customer data is
  on it — the free tier's project can be paused after inactivity, which is
  not an acceptable risk for a system whose entire value proposition is
  availability and trustworthiness of the record.
- **Point-in-time recovery / automated backups enabled** (a paid-tier
  Supabase feature) — this is the actual disaster-recovery story for the
  hash-chained ledger described in `docs/database/DATABASE.md` §6: the
  hash chain proves nothing was *tampered with*; backups are the separate,
  necessary answer to "what if the database itself is lost or corrupted."
  Neither one substitutes for the other.
- **Custom SMTP configured for Auth emails** (Dashboard → Authentication →
  Email) — Supabase's built-in email sending is explicitly rate-limited
  and intended for development/testing, not for real customers receiving
  invite/reset emails reliably.
- Web: Vercel production deployment on a real domain, environment
  variables set per-environment in Vercel (never in a committed file —
  `.env.local`/`.env` are already gitignored, and that must stay true).
- Mobile: EAS "production" build profile, submitted via `eas submit` to
  TestFlight for pilot customers and, eventually, the App Store for
  general availability.
- Anthropic API key: its own key (never shared with dev/staging), with
  usage monitoring — every `extract-pallet` call is a real cost (see
  `docs/api/API.md` §4's rate limiting, which exists specifically to
  bound this), and production usage is the number that actually matters
  for unit economics.
- Secrets: Edge Function secrets (`ANTHROPIC_API_KEY`) set via
  `supabase secrets set` against the production project specifically —
  never copy a production secret into a local `.env` file to "test
  something quickly." If a production-only bug needs investigating, do it
  against staging with a reproduction, not against production with a
  shortcut.

## Migrations across environments

Every environment applies the exact same migration files in the exact
same numeric order (`0001` through `0014`, `0000` always excluded outside
the local dev harness) — there is no environment-specific schema
divergence, by design. A schema change is written once, tested locally
or in staging, and then applied to production through the identical
sequence, not a hand-adapted version of it. Once there's more than one
person contributing migrations, promoting this from "run the loop in
`TEST_PLAN.md` §1 by hand" to a CI-run step (migrations apply
automatically on merge to a designated branch, staging first, production
only after a manual approval gate) is the natural next investment — not
built now, since it's tooling for a team size this project doesn't have
yet, but worth flagging as the obvious next step once it does.

## Monitoring — current state and the honest gap

Today, observability is whatever Supabase's dashboard provides natively:
Postgres logs, Edge Function invocation logs, Auth logs, and the
`activity_log`/hash-chained ledger tables this product already writes for
its own audit purposes. There is no external error tracking (e.g. Sentry)
or uptime monitoring configured yet, and no alerting if `extract-pallet`
starts failing at scale or a Claude API outage silently breaks the
receiving flow. For a single-warehouse pilot, watching the Supabase
dashboard directly during test sessions is sufficient. It stops being
sufficient the moment a pilot customer is using this unsupervised on a
real shift — that's the trigger for adding real monitoring, not a
calendar date.

## Rollback

Because the ledger tables are append-only and hash-chained by design (see
`docs/database/DATABASE.md` §6), "rolling back" bad *data* is never a
matter of deleting rows — it isn't possible, on purpose. A bad deploy of
*application code* (web or mobile) rolls back the normal way (Vercel's
instant rollback to a previous deployment; EAS's previous build remains
installable/re-submittable). A bad *migration* is the one genuinely hard
case — Postgres schema changes are not generally safely reversible once
real data depends on the new shape, which is exactly why every migration
in this repo is written narrowly and reviewed for what it actually changes
(see the pre-M2 architecture review's own migrations for examples) rather
than batched into large, harder-to-reason-about changes.
