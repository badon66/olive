-- Carryover is MANUAL, not automatic (BUILD_PLAN correction).
--
-- A task that is overdue with auto_carry_forward = true simply STAYS on its
-- original date and surfaces in the "Carryover Tasks" dropdown. It leaves that
-- dropdown only when the user drags it onto a day/section or edits it and sets a
-- new date. Nothing moves a due_date on the user's behalf.
--
-- This reverses 20260728000001_carry_forward_cron.sql, which scheduled a nightly
-- job that rewrote due_date. That job had already run and bumped 7 tasks.

-- 1. Stop the nightly bump.
select cron.unschedule('olive-carry-forward');

-- 2. Drop the stamp column. It existed only so a cron-bumped task stayed visible
--    in the dropdown after its due_date had been rewritten. With no rewriting,
--    "overdue + opted in" is the whole rule and this column has no meaning.
--    Only ever written by the cron — no user-authored data is lost.
drop index if exists tasks_carried_forward_on_idx;
alter table tasks drop column if exists carried_forward_on;
