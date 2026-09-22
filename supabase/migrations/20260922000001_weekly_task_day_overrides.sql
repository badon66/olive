-- One-day-only tweaks to a single weekly occurrence: rename it, move it to a
-- different part of the day, or pin an exact clock time — for that date and
-- that date ONLY, leaving the recurring pattern completely untouched.
--
-- Deliberately its own table rather than extra columns on weekly_task_checkins.
-- A checkin row carries a STATUS, so an override stored there would have to
-- invent one for a day that has none. For a count-mode task that would light the
-- cube as 'planned' and shift the week's progress arithmetic
-- (planned + completed + toPlan = target) purely as a side effect of renaming
-- today's occurrence. Overrides are presentational and must never perturb that
-- model, nor appearsOn(), nor cubeStates().
--
-- Every override column is nullable and independent: null = inherit from
-- weekly_tasks for that day. Rows are scoped to one date, so they expire on
-- their own — there is nothing to clean up and nothing to unwind.
--
-- Distinct from a per-day SKIP (weekly_task_checkins.status = 'skipped', which
-- removes the occurrence) and from a PAUSE (weekly_tasks.paused, indefinite).
create table weekly_task_day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  weekly_task_id uuid not null references weekly_tasks on delete cascade,
  date date not null,

  -- null = use weekly_tasks.name on this day. Blank is not a rename.
  name text check (name is null or length(btrim(name)) > 0),

  -- null = use weekly_tasks.time_section on this day.
  time_section time_section,

  -- null = no pinned appointment time. Weekly tasks own no clock time of their
  -- own; this is a one-day pin, mirroring tasks.scheduled_time.
  scheduled_time time,

  created_at timestamptz not null default now(),

  unique (weekly_task_id, date),

  -- A row overriding nothing is meaningless; the app deletes rather than
  -- leaving one behind, and this keeps that honest.
  constraint weekly_task_day_overrides_not_empty
    check (name is not null or time_section is not null or scheduled_time is not null)
);

comment on table weekly_task_day_overrides is
  'One-day-only overrides for a weekly occurrence (name / time_section / scheduled_time). A null column inherits from weekly_tasks. Never affects the recurrence pattern, the cube states, or the weekly progress totals.';

-- Every schedule read resolves overrides for one day at a time.
create index weekly_task_day_overrides_date_idx
  on weekly_task_day_overrides (user_id, date);

alter table weekly_task_day_overrides enable row level security;
create policy "own weekly day overrides" on weekly_task_day_overrides for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
