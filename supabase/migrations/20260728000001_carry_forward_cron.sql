-- Carryover tasks actually roll forward at the 1:30 AM rollover, instead of just
-- being surfaced as overdue.

-- Stamp of the day a task was last rolled into. Without this, bumping due_date to
-- today would make the task stop looking overdue and silently vanish from the
-- "Carryover Tasks" nudge — this is what keeps it visible on the day it landed.
alter table tasks add column carried_forward_on date;
create index tasks_carried_forward_on_idx on tasks (carried_forward_on)
  where carried_forward_on is not null;

-- 11:00 UTC = 5:00 MDT (summer); 12:00 UTC = 5:00 MST (winter). The function
-- itself checks Edmonton local time is inside the rollover window, so exactly one
-- firing per day does work. The bump is idempotent either way.
select cron.schedule(
  'olive-carry-forward',
  '0 11,12 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/carry-forward',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
