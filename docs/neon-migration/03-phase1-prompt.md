# Phase 1 — paste this into Claude Code, in `C:\Apps\Olive`

Everything in this phase happens on Neon. Olive keeps running on Supabase
throughout, and no application code is touched. If Neon's Data API turns out
not to be good enough, we stop here having lost nothing.

---

## The prompt

> Read `CLAUDE.md` first — its working rules apply, especially building one
> phase at a time and stopping for approval.
>
> We are moving Olive's database off Supabase and onto Neon. The reason is
> narrow: Supabase's free tier allows two active projects, and the slot is
> needed elsewhere. This is **Phase 1 of 6** and it is database-only.
>
> **Before anything else — the working tree is dirty.** There are 22 modified
> files and several untracked ones, including a whole unfinished feature
> (`src/lib/flexible.ts`, `src/lib/flexible.test.ts`,
> `src/components/CandidateDatesGrid.tsx`, and migration
> `supabase/migrations/20260814000001_flexible_windows_and_skip.sql`). None of
> it is pushed. Review it, commit it in granular commits as CLAUDE.md requires,
> and push. Do not start the migration on top of uncommitted work — if
> something goes wrong later there'll be no way to tell what caused it. If any
> of it is half-finished and shouldn't be committed, say so and stop.
>
> Then, Phase 1 only:
>
> 1. **Create a Neon project** named `olive`, in region **`us-east-2`**. That
>    region specifically: Neon's Object Storage, Functions and AI Gateway are
>    in public beta and only available there. Phase 4 will likely use Neon
>    Functions to replace Olive's five Supabase Edge Functions, and a project
>    can't change region later.
>
> 2. **Apply `docs/neon-migration/01-schema.sql`.** It reproduces the live
>    Supabase schema — 6 enum types, 9 tables, every index including the
>    partial ones — with two deliberate changes: no foreign keys to
>    `auth.users` (Neon has no such table), and the 9 RLS policies rewritten
>    against `auth.user_id()` with a `::text` cast, since Neon returns the JWT
>    subject as text where Supabase returned uuid.
>
> 3. **Enable the Data API** on the project, and confirm the `anonymous` role
>    can read nothing. Olive is a browser app with no server: the key ships in
>    the public bundle, so RLS is the only thing protecting the data. Verify
>    this rather than assuming it — try an unauthenticated read and confirm it
>    returns nothing.
>
> 4. **Load the data.** `docs/neon-migration/02-copy-data.md` has the pg_dump
>    route, which is the complete one. `docs/neon-migration/00-backup-core-data.sql`
>    is a partial fallback holding 72 rows across the 7 tables that can't be
>    regenerated — it deliberately excludes `daily_briefs`, which the brief job
>    regenerates. Prefer pg_dump; use the fallback only if pg_dump isn't
>    available.
>
> 5. **Verify the counts** against these, taken from the live Supabase database
>    on 2026-08-23:
>
>    | table | rows |
>    |---|---|
>    | daily_briefs | 47 |
>    | weekly_task_checkins | 27 |
>    | tasks | 25 |
>    | weekly_tasks | 9 |
>    | categories | 5 |
>    | active_jobs | 4 |
>    | daily_schedule_setup | 1 |
>    | reminders | 1 |
>    | memories | 0 |
>
> 6. **Report back** with: the project id and region, whether the Data API is
>    on, the row counts you actually got, and the result of the unauthenticated
>    read test.
>
> **Do not**, in this phase: change any file under `src/`, install or remove
> any npm package, touch `supabase/functions/`, touch anything in the Supabase
> project, or set up Neon Auth. Those are Phases 2 to 6.
>
> **Leave the user id alone.** Every row carries
> `user_id = 1b2f028a-496a-4332-b6af-0e5ddd1d9a53`, the Supabase Auth id. Neon
> Auth will issue a different one in Phase 2, and the remap happens then — the
> UPDATE statements are in `02-copy-data.md`. Until that runs, an authenticated
> read through the Data API will correctly return zero rows. That is expected
> at the end of Phase 1, not a failure.

---

## What to tell me afterwards

Paste back its final report. What I most want to know:

- Did the schema apply cleanly, or did anything need adjusting?
- Do the row counts match?
- **Did the unauthenticated read return nothing?** If it returned rows, stop —
  the Data API isn't enforcing RLS the way we need and the plan changes.
- Anything the Neon skill said about the Data API being unsuitable.
