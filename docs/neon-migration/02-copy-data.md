# Copying Olive's data across

Olive holds about **27 kB of actual row data** — 119 rows across 9 tables. The
13 MB the dashboard reports is Postgres overhead, not your data.

| Table | Rows |
|---|---|
| daily_briefs | 47 |
| weekly_task_checkins | 27 |
| tasks | 25 |
| weekly_tasks | 9 |
| categories | 5 |
| active_jobs | 4 |
| daily_schedule_setup | 1 |
| reminders | 1 |
| memories | 0 |

At that size, use `pg_dump`. It handles the enums, the arrays, the jsonb and
the quoting correctly, and it never puts your data through anyone else's
hands.

## The two commands

Run these after `01-schema.sql` has been applied to Neon.

```bash
# 1. Pull the data only — the schema is already there, and Supabase's version
#    of it carries auth.users references Neon can't satisfy.
pg_dump "postgresql://postgres:PASSWORD@db.dpkdsmvskryettdxcvpp.supabase.co:5432/postgres" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  -f olive-data.sql

# 2. Push it into Neon.
psql "YOUR-NEON-CONNECTION-STRING" -f olive-data.sql
```

Both connection strings are in the respective dashboards — Supabase under
Project Settings → Database, Neon on the project home page. Don't paste either
into a chat; they're passwords.

**No pg_dump on Windows?** It ships with the PostgreSQL installer, or Neon's
dashboard has an Import Data flow that takes the Supabase connection string
directly and does both steps for you.

## Then remap your user id

Every row carries `user_id = 1b2f028a-496a-4332-b6af-0e5ddd1d9a53` — your
Supabase Auth id. Neon Auth issues a different one, and the RLS policies
compare against it, so until this runs you'll be logged in and see nothing.

Sign in to Olive once against Neon Auth, get your new id, then:

```sql
-- Replace both values, then run the whole block as one transaction.
begin;
  \set old '1b2f028a-496a-4332-b6af-0e5ddd1d9a53'
  \set new 'YOUR-NEON-AUTH-USER-ID'

  update categories           set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update active_jobs          set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update tasks                set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update weekly_tasks         set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update weekly_task_checkins set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update daily_briefs         set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update daily_schedule_setup set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update memories             set user_id = :'new'::uuid where user_id = :'old'::uuid;
  update reminders            set user_id = :'new'::uuid where user_id = :'old'::uuid;
commit;
```

Run it as the database owner, not through the Data API — RLS would otherwise
hide the very rows you're trying to update.

If Neon Auth issues something that isn't a uuid, tell me: `user_id` would need
to become `text`, which changes the schema and the policies.

## Load order

`pg_dump --data-only` writes tables in dependency order, so the foreign keys
resolve on their own. If you ever load tables by hand instead, the order is:

`categories` → `active_jobs` → `tasks` → `weekly_tasks` →
`weekly_task_checkins` → then `daily_briefs`, `daily_schedule_setup`,
`memories`, `reminders` in any order.

## Checking it landed

```sql
select 'tasks' t, count(*) from tasks
union all select 'daily_briefs', count(*) from daily_briefs
union all select 'weekly_tasks', count(*) from weekly_tasks
union all select 'weekly_task_checkins', count(*) from weekly_task_checkins
union all select 'categories', count(*) from categories
union all select 'active_jobs', count(*) from active_jobs
union all select 'daily_schedule_setup', count(*) from daily_schedule_setup
union all select 'reminders', count(*) from reminders
union all select 'memories', count(*) from memories
order by 1;
```

Against the table above. Every number should match.

## Don't delete the Supabase project yet

Leave Olive's Supabase project alone until the app has run against Neon for a
few days. Pausing it frees the project slot just as well as deleting does, and
pausing is reversible.

The order that keeps you safe:

1. Apply the schema to Neon, copy the data, verify the counts
2. Point Olive at Neon, use it normally for a few days
3. Only then pause the Supabase project — which is the moment the slot opens
   up for the jersey app
4. Delete it whenever you're ready, or never

Note that step 3 is what actually unblocks the jersey app. Until then nothing
about hosting changes.
