-- Advisor fix: pg_net extension belongs in the extensions schema, not public.
-- Its functions live in the `net` schema either way, so the cron job body is unaffected.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
