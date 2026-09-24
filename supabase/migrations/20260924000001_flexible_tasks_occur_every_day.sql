-- Flexible tasks occur on EVERY day of their set, instead of being placed on
-- one chosen day (reworked at Keenan's direction, 2026-09-24).
--
-- Supersedes the original model in BUILD_PLAN lines 84-85, where the system
-- picked a single day inside the window based on how busy each candidate day
-- was and moved the task between days as they filled up. A task given a
-- Sept 23-25 window therefore surfaced on exactly one day and drifted between
-- days — working as originally specified, but not what is wanted.
--
-- New behaviour:
--   window  occurs on every day from window_start to window_end. ONE completion
--           finishes it and it stops appearing on the remaining days.
--   pick    occurs on every chosen day, each completed INDEPENDENTLY — finishing
--           Monday leaves Wednesday still showing.

-- Per-day completion, for pick mode. A date in here is done for that day only;
-- the task's other chosen days are untouched. Null/empty means nothing done yet.
alter table tasks add column completed_dates date[];

comment on column tasks.completed_dates is
  'Per-day completions for candidate_dates (pick mode). Each chosen day completes independently; the task as a whole finishes only once every chosen day is listed here.';

-- placed_date held which day the old scheduler had CHOSEN for a flexible task.
-- Nothing chooses a day any more — the task belongs to all of them — so the
-- column is meaningless. It only ever held derived bookkeeping (a copy of the
-- day the scheduler picked), never anything the user entered, so dropping it
-- loses nothing. Left in place it would read like live state to the next reader.
alter table tasks drop column placed_date;

-- Backfill: existing flexible rows carry the day the old scheduler CHOSE as
-- their due_date. Under the new model due_date is the DEADLINE — the last day
-- the task can still happen — so realign them. Without this an open window task
-- keeps a due_date in the middle of its own range and reads as overdue early.
update tasks
   set due_date = window_end
 where status = 'open' and window_start is not null and window_end is not null
   and (due_date is distinct from window_end);

update tasks
   set due_date = (select max(d) from unnest(candidate_dates) as d)
 where status = 'open' and candidate_dates is not null and array_length(candidate_dates, 1) > 0
   and (due_date is distinct from (select max(d) from unnest(candidate_dates) as d));
