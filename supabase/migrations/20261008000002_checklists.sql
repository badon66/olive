-- Checklist tasks (BUILD_PLAN, 2026-10-08): a task — or a weekly task — can hold
-- a short list of simple checkbox items. Items are NOT tasks: no due date, no
-- time_section, no category; they never appear on the schedule on their own.
--
-- Exactly one parent per item (task_id XOR weekly_task_id). Deleting the parent
-- deletes its items (ON DELETE CASCADE).
--
-- For a regular task, `completed` on the item IS the checked state, and it is
-- never reset by carryover or a flexible-window move — nothing here keys on a
-- date, so moving the parent cannot touch it.
--
-- For a weekly task, the item LIST is shared by every occurrence, but the
-- checked state is per date: weekly_checklist_checks holds one row per
-- (item, date). A day with no row is an empty box, which is how Tuesday starts
-- fresh even if Monday was all ticked.

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  weekly_task_id uuid references public.weekly_tasks(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  sort_order int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint task_checklist_items_one_parent check ((task_id is null) <> (weekly_task_id is null))
);

create index task_checklist_items_task_idx on public.task_checklist_items (task_id) where task_id is not null;
create index task_checklist_items_weekly_idx on public.task_checklist_items (weekly_task_id) where weekly_task_id is not null;

alter table public.task_checklist_items enable row level security;
create policy "own checklist items" on public.task_checklist_items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.weekly_checklist_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checklist_item_id uuid not null references public.task_checklist_items(id) on delete cascade,
  date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (checklist_item_id, date)
);

create index weekly_checklist_checks_date_idx on public.weekly_checklist_checks (date);

alter table public.weekly_checklist_checks enable row level security;
create policy "own weekly checklist checks" on public.weekly_checklist_checks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
