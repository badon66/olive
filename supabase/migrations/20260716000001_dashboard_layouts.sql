-- Customize mode: per-user dashboard arrangement (position/width/custom label
-- per section), persisted so the layout survives reloads and devices.
create table dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  -- { "<sectionKey>": { "x": 0, "y": 0, "w": 6, "label": "optional custom title" } }
  layout jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table dashboard_layouts enable row level security;
create policy "own layout" on dashboard_layouts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
