-- Carryover: one-off tasks can opt into rolling forward when not completed.
-- Surfaced in Today's Schedule's "Carryover Tasks" button (distinct from the
-- weekly-task planning nudge). Only tasks with this flag ever carry over.
alter table tasks add column auto_carry_forward boolean not null default false;

-- Tomorrow's-schedule setup gains bedtime + a "planning to go selling" flag
-- (BUILD_PLAN: the setup form writes date, wake_time, bedtime, blocked_windows,
-- going_selling).
alter table daily_schedule_setup add column bedtime time;
alter table daily_schedule_setup add column going_selling boolean not null default false;
