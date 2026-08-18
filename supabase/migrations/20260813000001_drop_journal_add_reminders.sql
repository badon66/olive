-- Phase 2 revision: Journal is removed outright, Reminders replaces it.

-- ── Journal removal ────────────────────────────────────────────────────────
-- Built and shipped earlier in Phase 2; the spec now drops it entirely rather
-- than leaving the table orphaned behind a hidden UI.
drop table if exists journal_entries;

-- ── Reminders ──────────────────────────────────────────────────────────────
-- Every recurrence shape in one table. Which columns matter depends on
-- recurrence_type; the check constraint keeps each shape internally coherent
-- so a half-specified reminder can never be stored.
create type reminder_recurrence as enum ('one_time', 'interval', 'daily', 'weekly', 'monthly');

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  message text,
  recurrence_type reminder_recurrence not null,
  fire_at timestamptz,            -- one_time: the exact moment
  interval_minutes int,           -- interval: e.g. 30 = every half hour
  days_of_week int[],             -- weekly: 0=Monday .. 6=Sunday
  day_of_month int,               -- monthly: 1..31
  time_of_day time,               -- daily/weekly/monthly: when in the day
  active boolean not null default true,
  -- Firing bookkeeping: last_fired_at makes catch-up idempotent, so a missed
  -- cron tick fires once when it resumes rather than replaying every slot.
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),

  constraint reminder_shape_is_coherent check (
    case recurrence_type
      when 'one_time' then fire_at is not null
      when 'interval' then interval_minutes is not null and interval_minutes > 0
      when 'daily'    then time_of_day is not null
      when 'weekly'   then time_of_day is not null and days_of_week is not null and array_length(days_of_week, 1) > 0
      when 'monthly'  then time_of_day is not null and day_of_month between 1 and 31
    end
  )
);

alter table reminders enable row level security;
create policy "own reminders" on reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index reminders_active_idx on reminders (user_id, active) where active;
