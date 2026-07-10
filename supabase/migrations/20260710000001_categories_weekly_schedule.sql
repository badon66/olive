-- Phase 1/2 correction round: real categories table, weekly-task recurrence
-- overhaul (planned/completed cubes), tomorrow's-schedule setup, journal
-- entry_time, task duration_minutes.

-- ============ categories: real table replacing the fixed enum ============
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#3fa968',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table categories enable row level security;
create policy "own categories" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed (colors per BUILD_PLAN: blue / yellow / a true green distinct from the HUD accent)
insert into categories (user_id, name, color)
select u.id, v.name, v.color
from auth.users u
cross join (values
  ('Personal', '#4a9eff'),
  ('PowerPlay Customs', '#f5c518'),
  ('Alberta Premium Coatings', '#52c41a')
) as v(name, color);

alter table tasks add column category_id uuid references categories(id);
update tasks t
set category_id = c.id
from categories c
where c.user_id = t.user_id
  and c.name = case t.category
    when 'personal' then 'Personal'
    when 'powerplay' then 'PowerPlay Customs'
    when 'alberta_premium' then 'Alberta Premium Coatings'
  end;
alter table tasks alter column category_id set not null;
alter table tasks drop column category;
drop type task_category;

alter table tasks add column duration_minutes int
  check (duration_minutes is null or duration_minutes > 0);

-- ============ weekly tasks: rename + recurrence modes + cube states ============
alter table habits rename to weekly_tasks;
alter table habit_checkins rename to weekly_task_checkins;
alter table weekly_task_checkins rename column habit_id to weekly_task_id;

create type recurrence_mode as enum ('count', 'fixed_days');
create type checkin_status as enum ('planned', 'completed');

alter table weekly_tasks
  add column recurrence_mode recurrence_mode not null default 'count',
  add column target_per_week int check (target_per_week between 1 and 7),
  add column scheduled_days int[]; -- 0=Monday .. 6=Sunday

-- old daily habits = fixed_days every day; old weekly habits = count 1x/week
update weekly_tasks set recurrence_mode = 'fixed_days', scheduled_days = '{0,1,2,3,4,5,6}'
  where frequency = 'daily';
update weekly_tasks set recurrence_mode = 'count', target_per_week = 1
  where frequency = 'weekly';
alter table weekly_tasks drop column frequency;
drop type habit_frequency;

alter table weekly_task_checkins add column status checkin_status not null default 'completed';
update weekly_task_checkins set status = 'planned' where completed = false;
alter table weekly_task_checkins drop column completed;

-- ============ tomorrow's schedule setup (wake time + blocked windows) ============
create table daily_schedule_setup (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  wake_time time not null default '11:00', -- BUILD_PLAN default unless overridden
  blocked_windows jsonb not null default '[]', -- [{"start":"14:00","end":"15:30","label":"dentist"}]
  raw_blurb text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table daily_schedule_setup enable row level security;
create policy "own schedule setup" on daily_schedule_setup for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ journal: one log per day, entries carry a time ============
alter table journal_entries add column entry_time time not null default '12:00';
update journal_entries set entry_time = (created_at at time zone 'America/Edmonton')::time;
