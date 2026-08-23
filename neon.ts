import { defineConfig } from "@neon/config/v1";

/**
 * Olive's Neon services, declared in one place.
 *
 * `neon deploy` provisions whatever is listed here and then pulls the matching
 * variables into `.env.local`, so the local environment always matches what is
 * actually deployed. `neon config plan` shows the diff first.
 *
 *  - auth:    Neon Auth. Olive is single-user; this replaces Supabase Auth.
 *  - dataApi: the PostgREST-compatible HTTP endpoint the browser talks to.
 *             It authenticates with Neon Auth by default, which is why the two
 *             have to be enabled together — declaring dataApi alone is a type
 *             error that says so.
 *
 * Not declared yet: `preview.functions`, which is where Olive's five Supabase
 * Edge Functions are headed. That work is still to come, and Neon Functions
 * are public beta and only exist in us-east-2 — which is why the project lives
 * there.
 */
export default defineConfig({
  auth: true,
  dataApi: true,
});
