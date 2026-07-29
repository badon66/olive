-- Phase 3: Active Jobs log + job-linked sub-tasks.
-- A job has a name and a category/header (the same categories table tasks use).
-- Tasks may additionally be scoped to a job via a nullable job_id — otherwise a
-- job-linked task is a completely normal task.

create type job_status as enum ('quoted', 'sold', 'in_progress', 'paid');

create table active_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status job_status not null default 'quoted',
  -- The job's header (which company/custom category). Nullable: natural-language
  -- capture ("add a job, Dennis's driveway") may not name a company, and we never
  -- guess a wrong one — the user assigns it on the Jobs tab.
  category_id uuid references categories(id),
  sheet_row_ref text,          -- reserved for Phase 5 pay-sheet linkage
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table active_jobs enable row level security;
create policy "own jobs" on active_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at fresh so the brief can surface "changed yesterday".
create function active_jobs_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger active_jobs_set_updated_at
  before update on active_jobs
  for each row execute function active_jobs_touch_updated_at();

-- Job-linked sub-tasks: scope a task to a job. on delete set null so deleting a
-- job un-scopes its tasks rather than destroying them.
alter table tasks add column job_id uuid references active_jobs(id) on delete set null;
create index tasks_job_id_idx on tasks (job_id) where job_id is not null;
