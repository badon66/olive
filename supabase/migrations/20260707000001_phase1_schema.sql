-- Phase 1 schema: tasks, memories, daily_briefs + RLS
create type task_category as enum ('personal', 'powerplay', 'alberta_premium');
create type task_status as enum ('open', 'completed');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category task_category not null default 'personal',
  due_date date,
  status task_status not null default 'open',
  priority_weight int not null default 3 check (priority_weight between 1 and 5),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  date date,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  content jsonb not null,          -- { today: uuid[], overdue: uuid[], upcoming: uuid[], suggested_order: uuid[] }
  manual_order uuid[],             -- user's reorder for the day; wins over suggested_order when present
  generated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create index tasks_user_status_due_idx on tasks (user_id, status, due_date);
create index memories_user_idx on memories (user_id, created_at desc);

alter table tasks enable row level security;
alter table memories enable row level security;
alter table daily_briefs enable row level security;

create policy "own tasks" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own memories" on memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own briefs" on daily_briefs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
