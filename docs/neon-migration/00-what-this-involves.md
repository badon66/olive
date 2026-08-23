# Moving Olive off Supabase — what's actually involved

You've decided to do this, so this is the real plan rather than more arguing.
But you should go in knowing the shape of it, because it is **six separate
migrations, not one**.

## What Olive uses Supabase for

I read the code at `C:\Apps\Olive`. It depends on Supabase in six distinct
ways, and each needs its own answer:

| # | What it uses | Where it has to go |
|---|---|---|
| 1 | Postgres + row-level security | Neon + **Neon Data API** |
| 2 | Supabase Auth (email/password, one account) | **Neon Auth** |
| 3 | `@supabase/supabase-js` in the browser — 10 files, 46 call sites | `@neondatabase/neon-js` |
| 4 | 5 Edge Functions, 970 lines of Deno TypeScript | Vercel Functions |
| 5 | `pg_cron` + `pg_net` — 2 scheduled jobs that call those functions | Vercel Cron |
| 6 | Supabase Vault — your Anthropic key and other secrets | Vercel environment variables |

Items 4, 5 and 6 are the ones that make this a project rather than an
afternoon. Your Edge Functions are where Olive's actual intelligence lives —
the assistant, the daily brief, the reminder tick — and they're written for
Deno with Supabase's own client baked in.

## The thing that makes it possible at all

Olive is a browser app with no server. Neon on its own can't be reached from a
browser — a Postgres connection string is a password to everything and can
never ship in a bundle.

What makes this viable is that **Neon now has a PostgREST-compatible Data
API** plus **Neon Auth**, which together are a direct analogue of what Supabase
provides: an HTTP endpoint a browser can call, a JWT, and row-level security
enforcing who sees what. Your query code changes shape only slightly.

**It is in beta.** That's a real caveat for something you use daily. It's the
load-bearing assumption of this whole plan, and if it doesn't hold up in Phase
1, we stop there having lost nothing.

## Two corrections to what I sent you earlier

**The schema file has been rewritten.** The version I sent an hour ago dropped
row-level security, on the assumption that only server code would reach the
database. That was wrong for Olive — it's a browser app, the key in the bundle
is public by design, and RLS is the only thing protecting your data. The
updated `01-schema.sql` recreates all nine policies against Neon's
`auth.user_id()`. **Don't use the old file.**

**Your user id will change.** Every row carries
`user_id = 1b2f028a-496a-4332-b6af-0e5ddd1d9a53`, which is your Supabase Auth
id. Neon Auth will issue a different one. After loading the data, one UPDATE
per table remaps it — covered in `02-copy-data.md`.

## Phases

Olive's own CLAUDE.md says to build one phase at a time and stop for approval,
so that's how this runs.

**Phase 0 — Safety net.** Back up the data. Your code is already safe: it's
committed and pushed to `github.com/badon66/olive`, with only `LICENSE` and
`BriefView.tsx` modified locally. The database is the only thing with no copy.

**Phase 1 — Stand Neon up beside Supabase.** Create the project, apply the
schema, copy the data, remap the user id, verify the counts. Olive keeps
running on Supabase throughout. This is also where we find out whether the beta
Data API is good enough — if it isn't, we stop here and nothing is lost.

**Phase 2 — Auth.** Neon Auth, one account, and `AuthGate.tsx` rewritten.

**Phase 3 — The data layer.** `supabase-js` → `neon-js` across 10 files and 46
call sites, and regenerate `database.types.ts`. Mechanical but broad, and the
existing vitest suite is the safety net.

**Phase 4 — Edge Functions.** The big one. Five Deno functions plus their
shared libraries, rewritten as Vercel Functions, with the Anthropic key moved
to Vercel env vars.

**Phase 5 — Scheduled jobs.** The two `pg_cron` jobs become Vercel Cron
entries. Timezone logic is America/Edmonton and cron runs in UTC, so this needs
care — Olive's CLAUDE.md already flags it.

**Phase 6 — Cutover.** Point production at Neon, use it for a few days, then
**pause** (not delete) the Supabase project. Pausing is what frees the slot,
and it's reversible.

## What I need from you, in order

1. **A Neon account**, and a project created in it. Free tier is fine.
2. Tell me when Phase 1's schema is applied and I'll verify it.
3. Later, a **Vercel account decision** — Olive already deploys there, so its
   functions and cron would live in the same project.

I'll do Phase 0 now, since it needs nothing from you.

## One last note, then I'll drop it

None of this is needed to get the jersey app online. That app has its own
server, its data layer is one file I wrote today, and pointing it at Neon
directly would take an hour and free the Supabase slot without touching Olive
at all. The offer stays open if Phase 1 turns out worse than it looks.
