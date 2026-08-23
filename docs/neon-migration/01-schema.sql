-- Olive — schema for Neon.
--
-- Reproduced from the live Supabase project (dpkdsmvskryettdxcvpp) with three
-- deliberate differences, all forced by Neon being plain Postgres rather than
-- Supabase:
--
--  1. NO auth.users TABLE. Every table had user_id REFERENCES auth.users(id).
--     Neon has no auth schema, so user_id stays a plain uuid column with the
--     same values and the same name — nothing in the app has to change — but
--     the foreign key is gone. Olive is single-user, so the constraint was
--     protecting against something that can't happen.
--
--  2. RLS IS KEPT, rewritten for Neon Auth. Supabase's policies call
--     auth.uid(); Neon's equivalent is auth.user_id(), which returns the JWT
--     subject as TEXT rather than uuid — hence the cast in every policy below.
--
--     This matters more than it looks. Olive is a browser app: the key in the
--     bundle is public by design, and RLS is the only thing standing between
--     that key and the data. Ship this schema without policies and every row
--     is readable by anyone who opens devtools.
--
--  3. gen_random_uuid() comes from pgcrypto, enabled below. Supabase has it on
--     by default.
--
-- Everything else — column types, defaults, check constraints, unique
-- constraints, every index including the partial ones — is identical.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ *
 * Enum types. These must exist before the tables that use them.
 * ------------------------------------------------------------------ */

create type task_status         as enum ('open', 'completed');
create type time_section        as enum ('morning', 'midday', 'afternoon', 'evening', 'anytime', 'night');
create type recurrence_mode     as enum ('count', 'fixed_days');
create type checkin_status      as enum ('planned', 'completed', 'skipped');
create type job_status          as enum ('quoted', 'sold', 'in_progress', 'paid');
create type reminder_recurrence as enum ('one_time', 'interval', 'daily', 'weekly', 'monthly');

/* ------------------------------------------------------------------ *
 * categories — referenced by tasks and active_jobs, so it goes first.
 * ------------------------------------------------------------------ */

create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  color      text not null default '#3fa968',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

/* ------------------------------------------------------------------ *
 * active_jobs
 * ------------------------------------------------------------------ */

create table active_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  name          text not null,
  status        job_status not null default 'quoted',
  category_id   uuid references categories (id),
  sheet_row_ref text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* ------------------------------------------------------------------ *
 * tasks
 * ------------------------------------------------------------------ */

create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  title              text not null,
  due_date           date,
  status             task_status not null default 'open',
  priority_weight    integer not null default 3 check (priority_weight >= 1 and priority_weight <= 5),
  created_at         timestamptz not null default now(),
  completed_at       timestamptz,
  scheduled_time     time,
  time_section       time_section,
  category_id        uuid not null references categories (id),
  duration_minutes   integer check (duration_minutes is null or duration_minutes > 0),
  job_id             uuid references active_jobs (id),
  description        text,
  auto_carry_forward boolean not null default true,
  sort_order         integer,
  window_start       date,
  window_end         date,
  candidate_dates    date[],
  placed_date        date
);

create index tasks_user_status_due_idx on tasks (user_id, status, due_date);
create index tasks_category_id_idx on tasks (category_id);
create index tasks_job_id_idx on tasks (job_id) where job_id is not null;
create index tasks_flexible_idx on tasks (user_id, status)
  where window_start is not null or candidate_dates is not null;

/* ------------------------------------------------------------------ *
 * weekly_tasks and their check-ins
 *
 * Note the index and constraint names: these were called habits before a
 * rename, and the old names stuck. Kept verbatim so anything referring to
 * them by name still works.
 * ------------------------------------------------------------------ */

create table weekly_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  name            text not null,
  created_at      timestamptz not null default now(),
  time_section    time_section,
  recurrence_mode recurrence_mode not null default 'count',
  target_per_week integer check (target_per_week >= 1 and target_per_week <= 7),
  scheduled_days  integer[],
  sort_order      integer
);

create index weekly_tasks_user_idx on weekly_tasks (user_id);
create index weekly_tasks_sort_order_idx on weekly_tasks (user_id, sort_order) where sort_order is not null;

create table weekly_task_checkins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  weekly_task_id   uuid not null references weekly_tasks (id),
  date             date not null,
  note             text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  created_at       timestamptz not null default now(),
  status           checkin_status not null default 'completed',
  constraint habit_checkins_habit_id_date_key unique (weekly_task_id, date)
);

create index habit_checkins_habit_date_idx on weekly_task_checkins (weekly_task_id, date desc);
create index weekly_task_checkins_user_idx on weekly_task_checkins (user_id);

/* ------------------------------------------------------------------ *
 * daily_briefs — one generated brief per day.
 * ------------------------------------------------------------------ */

create table daily_briefs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  brief_date   date not null,
  content      jsonb not null,
  manual_order uuid[],
  generated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

/* ------------------------------------------------------------------ *
 * daily_schedule_setup — one row per day describing that day's shape.
 * ------------------------------------------------------------------ */

create table daily_schedule_setup (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  date            date not null,
  wake_time       time not null default '11:00:00',
  blocked_windows jsonb not null default '[]'::jsonb,
  raw_blurb       text,
  created_at      timestamptz not null default now(),
  bedtime         time,
  going_selling   boolean not null default false,
  unique (user_id, date)
);

/* ------------------------------------------------------------------ *
 * memories
 * ------------------------------------------------------------------ */

create table memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  content    text not null,
  date       date,
  tags       text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index memories_user_idx on memories (user_id, created_at desc);

/* ------------------------------------------------------------------ *
 * reminders
 * ------------------------------------------------------------------ */

create table reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  name             text not null,
  message          text,
  recurrence_type  reminder_recurrence not null,
  fire_at          timestamptz,
  interval_minutes integer,
  days_of_week     integer[],
  day_of_month     integer,
  time_of_day      time,
  active           boolean not null default true,
  last_fired_at    timestamptz,
  created_at       timestamptz not null default now()
);

create index reminders_active_idx on reminders (user_id, active) where active;

/* ------------------------------------------------------------------ *
 * Row-level security
 *
 * One policy per table, matching Supabase's exactly: you may touch a row if
 * it is yours. Written for the `authenticated` role, so the `anonymous` role
 * the Data API uses before login can read nothing at all.
 *
 * auth.user_id() returns TEXT (the JWT `sub`), while user_id is uuid — hence
 * the cast. Wrapping it in a SELECT lets Postgres evaluate it once per query
 * instead of once per row, which is what Supabase's own policies did.
 * ------------------------------------------------------------------ */

alter table categories           enable row level security;
alter table active_jobs          enable row level security;
alter table tasks                enable row level security;
alter table weekly_tasks         enable row level security;
alter table weekly_task_checkins enable row level security;
alter table daily_briefs         enable row level security;
alter table daily_schedule_setup enable row level security;
alter table memories             enable row level security;
alter table reminders            enable row level security;

create policy "own categories" on categories for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own jobs" on active_jobs for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own tasks" on tasks for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own habits" on weekly_tasks for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own checkins" on weekly_task_checkins for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own briefs" on daily_briefs for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own schedule setup" on daily_schedule_setup for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own memories" on memories for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);

create policy "own reminders" on reminders for all to authenticated
  using ((select auth.user_id()) = user_id::text)
  with check ((select auth.user_id()) = user_id::text);
