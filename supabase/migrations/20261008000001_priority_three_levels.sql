-- Priority: 1-5 → 1-3 with fixed meanings (BUILD_PLAN, 2026-10-08).
--
-- Which end of the old scale was "most important"? 5. Evidence in the code
-- before this change: lists sorted by priority_weight DESCENDING, the ranking
-- score ADDED priority_weight, TaskCard drew `priority_weight` filled bars out
-- of 5, and Active Tasks treated TOP_PRIORITY = 5 as the level that always
-- surfaces. So the two LEAST important levels are 1 and 2, the middle is 3,
-- and the two MOST important are 4 and 5.
--
-- Mapping applied to every existing row:
--   1, 2 → 1  (low — whenever, no rush)
--   3    → 2  (medium — comes forward when the schedule gets light)
--   4, 5 → 3  (urgent — always surfaced)
-- The old default (3 = middle) therefore becomes the new default 2 (medium).
--
-- The column keeps its name (priority_weight) so every reader on both runtimes
-- keeps working; only its range and meaning change.

alter table public.tasks drop constraint tasks_priority_weight_check;

update public.tasks
set priority_weight = case
  when priority_weight <= 2 then 1
  when priority_weight = 3 then 2
  else 3
end;

alter table public.tasks alter column priority_weight set default 2;
alter table public.tasks
  add constraint tasks_priority_weight_check check (priority_weight between 1 and 3);

comment on column public.tasks.priority_weight is
  '1 = low (whenever, no rush), 2 = medium (comes forward when the schedule gets light), 3 = urgent (always surfaced). Converted from a 1-5 scale on 2026-10-08: 1,2→1 · 3→2 · 4,5→3.';

-- Weekly tasks get the same scale and meanings (BUILD_PLAN Phase 2). They had no
-- priority column before, so every existing weekly task starts at medium.
alter table public.weekly_tasks
  add column priority_weight int not null default 2
  check (priority_weight between 1 and 3);

comment on column public.weekly_tasks.priority_weight is
  'Same 1-3 scale and meanings as tasks.priority_weight: 1 low, 2 medium, 3 urgent.';
