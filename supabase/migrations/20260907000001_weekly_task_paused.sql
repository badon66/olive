-- Pause a weekly task indefinitely (BUILD_PLAN Phase 2).
--
-- A paused task stops appearing anywhere it would normally show up — no
-- occurrences in Today's Schedule on any day, nothing in Active Tasks, no entry
-- in the "Unplanned Weekly Tasks" nudge, and no contribution to the week's
-- summary totals — but stays on the Weekly Tasks tab, marked, so it is easy to
-- find and unpause.
--
-- Deliberately a flag on the existing row rather than an archive table: the
-- recurrence pattern (scheduled_days / target_per_week) must survive untouched
-- so unpausing resumes exactly as before. This is a pause, not an archive, and
-- definitely not a delete.
--
-- Distinct from a per-day skip, which is one occurrence on one day and lives in
-- weekly_task_checkins with status 'skipped'.
alter table weekly_tasks
  add column paused boolean not null default false;

comment on column weekly_tasks.paused is
  'Indefinite pause. Hides the task everywhere except the Weekly Tasks tab; recurrence pattern untouched. Distinct from a per-day skipped checkin.';

-- Partial index: every schedule read filters to the not-paused tasks.
create index weekly_tasks_active_idx on weekly_tasks (user_id) where not paused;
