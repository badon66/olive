# Olive — build log

Companion to `docs/BUILD_PLAN.md` (the spec, which I don't edit). This is the
record of what's actually built and what's verified.

---

## 2026-08-23 — Neon migration, phases 0–3

**Why:** Supabase's free tier allows two active projects per person. Keenan has
Olive and Fieldbase, and the Powerplay order manager needed the third slot.
Nothing was wrong with Supabase; Olive was simply the one that could move.

### Done and verified

**Committed the outstanding work first** (three commits) — flexible task
windows and candidate dates, the date-picker UI, and the dashboard/schedule
integration. That was 22 modified files and a whole unfinished feature sitting
uncommitted, including a migration already applied to the database. All 210
tests passed on it as found, so it was complete work from an interrupted
session, not something half-written.

**Migrated the frontend to Neon.**

- `src/lib/supabase.ts` → `src/lib/db.ts`, exporting `db`
- All 46 `.from(...)` call sites: unchanged. Neon's Data API is
  PostgREST-compatible, the same protocol Supabase speaks.
- `AuthGate.tsx` and the five `userId()` helpers: unchanged.
  `SupabaseAuthAdapter()` presents Neon Auth through a Supabase-shaped API
  (`getSession`, `signInWithPassword`, `onAuthStateChange`, `getUser`).
- One env var (`VITE_NEON_DATABASE_URL`) instead of two. Neon derives both the
  auth and Data API endpoints from the base URL and manages the JWT, so no key
  ships in the bundle.
- `api.ts` gained its own `invokeFunction()`. Supabase's client bundled a
  function invoker; Neon's doesn't. The base URL is `VITE_FUNCTIONS_URL`, so
  the functions can change host without touching this file.
- `neon.ts` declares `auth` + `dataApi`; `neon deploy` provisions and pulls env.

**Verification:** 210/210 tests, `tsc -b` clean, production build clean, no new
lint errors. **None of it has run against a live Neon project** — that needs
the project to exist first.

### Not done — the Supabase project can't be paused yet

- **Five Edge Functions** (`assistant`, `daily-brief`, `reminder-tick`,
  `carry-forward`, `schedule-setup`), 970 lines of Deno. They need a new host
  and must verify the Neon JWT against Neon's JWKS rather than Supabase's.
- **Two `pg_cron` jobs.** Neon has no pg_cron; these become scheduled calls
  from whatever hosts the functions. Timezone is America/Edmonton, cron is
  UTC — see the rollover rules in CLAUDE.md, they're easy to get wrong.
- **Vault secrets** (`anthropic_api_key`, `cron_secret`, `project_url`) move
  with the functions.

Until all three are done the Supabase project stays live, and the slot it
occupies isn't freed — which was the whole point.

### Notes for whoever picks this up

- **The stack is beta.** `@neondatabase/neon-js` is `0.7.0-beta`, and the Data
  API, Object Storage and Functions are public beta. For an app used daily,
  that's a real risk, not a footnote.
- **A typing bug worked around:** the single-URL `createClient` overload
  declares `adapter` as an adapter *instance* where every other overload
  correctly wants the builder `SupabaseAuthAdapter()` returns. `db.ts` derives
  the two URLs with the library's own `defaultDeriveNeonUrls` to hit a
  well-typed overload instead of casting. Collapse it back when fixed.
- **`SupabaseAuthAdapter` is a migration aid**, not Neon's native API. Better
  Auth is. Switching is optional and touches six places.
- **The user id changes.** Rows carry the Supabase Auth id
  `1b2f028a-496a-4332-b6af-0e5ddd1d9a53`; Neon Auth issues a different one. The
  remap UPDATEs are in `docs/neon-migration/02-copy-data.md`. Until they run,
  an authenticated read returns zero rows — expected, not a bug.
- **RLS is the whole defence.** Olive is a browser app with no server; anything
  shipped is public. A new table without a policy is world-readable.
