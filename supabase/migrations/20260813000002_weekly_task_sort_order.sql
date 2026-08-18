-- Reorder arrows must work on weekly tasks too, not just regular tasks
-- (BUILD_PLAN: arrows consistently present everywhere items are listed).
-- `tasks` already has this column; weekly_tasks did not.
--
-- Nullable on purpose: null means "never manually ordered", and the UI falls
-- back to created_at for those, so existing rows keep their current order until
-- the user actually nudges something.
alter table weekly_tasks add column sort_order integer;

create index weekly_tasks_sort_order_idx on weekly_tasks (user_id, sort_order)
  where sort_order is not null;
