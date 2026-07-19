-- Supabase advisor cleanup:
-- 1) auth_rls_initplan — evaluate auth.uid() once per query, not per row
-- 2) unindexed foreign keys on tasks.category_id + the renamed weekly tables

alter policy "own tasks" on tasks
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own memories" on memories
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own briefs" on daily_briefs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own categories" on categories
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own habits" on weekly_tasks
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own checkins" on weekly_task_checkins
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own journal" on journal_entries
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own schedule setup" on daily_schedule_setup
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own layout" on dashboard_layouts
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index tasks_category_id_idx on tasks (category_id);
create index weekly_tasks_user_idx on weekly_tasks (user_id);
create index weekly_task_checkins_user_idx on weekly_task_checkins (user_id);
