-- Phase 2 Reminders — full build (BUILD_PLAN).
-- Adds the per-reminder alert policy (sound, volume, repeat-until-dismissed),
-- a durable record of each individual firing, and the global master switch.

-- ── 1. Per-reminder alert settings ──────────────────────────────────────────
alter table reminders
  add column sound_id text not null default 'double_ding',
  add column volume numeric not null default 0.7,
  add column max_repeats int not null default 10,
  add column repeat_interval_seconds int not null default 20;

-- sound_id is deliberately free TEXT rather than an enum: BUILD_PLAN requires
-- that dropping another file into public/sounds/ and registering it in
-- src/lib/sounds.ts works WITHOUT a schema change. An unknown id falls back to
-- the default sound in the client rather than failing.
alter table reminders
  add constraint reminder_volume_range check (volume >= 0 and volume <= 1),
  add constraint reminder_repeat_policy_sane check (
    max_repeats between 1 and 100 and repeat_interval_seconds between 1 and 3600
  );

comment on column reminders.sound_id is
  'Key into the client sound registry (src/lib/sounds.ts). Free text on purpose — new files must not need a migration.';
comment on column reminders.max_repeats is
  'Re-alert attempts before giving up quietly. BUILD_PLAN default: 10, spaced repeat_interval_seconds apart.';

-- ── 2. reminder_fires — one row per OCCURRENCE that came due ─────────────────
create table reminder_fires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid not null references reminders(id) on delete cascade,
  -- WHICH scheduled slot this row represents. This column is beyond
  -- BUILD_PLAN's listed set and is load-bearing: it is the idempotency key.
  -- BOTH the pg_cron tick and an open browser insert fire rows (the cron runs
  -- every 5 minutes, which is far too coarse for a "every 1 minute" reminder),
  -- so without a unique occurrence key the same alert would be raised twice.
  occurrence_at timestamptz not null,
  -- When the row was actually created — may lag occurrence_at if the tick was
  -- late or the app was closed through the occurrence.
  fired_at timestamptz not null default now(),
  dismissed boolean not null default false,
  repeat_count int not null default 0,
  unique (reminder_id, occurrence_at)
);

alter table reminder_fires enable row level security;
create policy "own reminder fires" on reminder_fires for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The hot query: "what is still demanding my attention?"
create index reminder_fires_pending_idx
  on reminder_fires (user_id, dismissed, occurrence_at desc)
  where not dismissed;

-- ── 3. Global "Reminders Active" master switch ──────────────────────────────
-- BUILD_PLAN calls this "a simple single-value setting — doesn't need its own
-- table". It does need a row somewhere: the pg_cron tick has to honour it
-- server-side (otherwise fire rows pile up while the switch is off and all
-- alert at once when it comes back on), and it must be RLS-scoped like
-- everything else. One row per user is that simple version.
create table app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders_globally_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
create policy "own settings" on app_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed the existing single user so the UI has a row to toggle from the start.
insert into app_settings (user_id)
select user_id from app_user
on conflict (user_id) do nothing;
