-- Anthropic API key moves to Vault (canonical location) — the dashboard-pasted
-- edge secret proved error-prone. Value inserted out-of-band, never in this file.
-- The assistant edge function reads it via this service-role-only RPC,
-- preferring Vault over the (possibly stale) ANTHROPIC_API_KEY env secret.
create function get_anthropic_key() returns text
language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'anthropic_api_key'
$$;
revoke all on function get_anthropic_key() from public, anon, authenticated;
grant execute on function get_anthropic_key() to service_role;
