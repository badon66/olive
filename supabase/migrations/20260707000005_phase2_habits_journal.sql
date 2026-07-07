-- Phase 2: habits + journal
create type habit_frequency as enum ('daily', 'weekly');

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency habit_frequency not null default 'daily',
  created_at timestamptz not null default now()
);

create table habit_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  date date not null,
  completed boolean not null default true,
  note text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  raw_transcript text not null,
  cleaned_text text,               -- null = not cleaned yet (e.g. API unavailable); UI shows raw
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index habit_checkins_habit_date_idx on habit_checkins (habit_id, date desc);
create index journal_entries_user_date_idx on journal_entries (user_id, date desc);

alter table habits enable row level security;
alter table habit_checkins enable row level security;
alter table journal_entries enable row level security;

create policy "own habits" on habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own checkins" on habit_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own journal" on journal_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
