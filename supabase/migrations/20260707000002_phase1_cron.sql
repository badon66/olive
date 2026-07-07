-- Phase 1 cron: daily brief at 7:00 America/Edmonton, DST-proof.
-- Secrets (cron_secret, project_url) live in Vault — inserted out-of-band, never in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Single-user helper for the cron path (the edge function's service-role client
-- can't query auth.users through PostgREST directly)
create view app_user with (security_invoker = off) as
  select id as user_id from auth.users order by created_at limit 1;
revoke all on app_user from anon, authenticated;
grant select on app_user to service_role;

-- Lets the daily-brief edge function validate the x-cron-secret header against
-- Vault, so the secret never needs to exist as a dashboard-managed env secret.
create function get_cron_secret() returns text
language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
$$;
revoke all on function get_cron_secret() from public, anon, authenticated;
grant execute on function get_cron_secret() to service_role;

-- 13:00 UTC = 7:00 MDT (summer); 14:00 UTC = 7:00 MST (winter).
-- The function itself checks Edmonton local hour == 7, so exactly one firing per day does work.
select cron.schedule(
  'olive-daily-brief',
  '0 13,14 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
