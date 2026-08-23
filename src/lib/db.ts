import { createClient, SupabaseAuthAdapter, defaultDeriveNeonUrls } from "@neondatabase/neon-js";
import type { Database } from "./database.types";

/**
 * Olive's database and auth client — Neon (Lakebase Postgres).
 *
 * Replaces Supabase. The reason was mundane: Supabase's free tier allows two
 * active projects and the third slot was needed elsewhere. Nothing was wrong
 * with Supabase itself.
 *
 * WHY THE REST OF THE APP DIDN'T CHANGE
 *
 * Neon's Data API is PostgREST-compatible, which is the same protocol Supabase
 * speaks, so every `.from(...).select(...).eq(...)` call in the hooks works
 * unaltered. And `SupabaseAuthAdapter()` deliberately presents Neon Auth
 * through a Supabase-shaped API — `getSession`, `signInWithPassword`,
 * `onAuthStateChange`, `getUser` — so AuthGate and the `userId()` helpers in
 * the hooks didn't need rewriting either.
 *
 * That adapter is a migration aid, not the native API. Neon's own is Better
 * Auth (`signIn.email(...)`, `useSession()`). Staying on the adapter keeps this
 * change small and reviewable; moving to Better Auth later is a separate,
 * optional job, and only AuthGate and five one-line `userId()` helpers touch
 * auth at all.
 *
 * ONE URL, NOT TWO
 *
 * Supabase needed a project URL plus an anon key. Neon derives both the auth
 * and Data API endpoints from a single base URL, and the JWT is managed by the
 * client — so there is no key to ship in the bundle.
 *
 * WHAT STILL PROTECTS THE DATA
 *
 * Olive is a browser app with no server: anything here is public. Row-level
 * security is the only thing standing between an anonymous visitor and every
 * row. Every table has RLS enabled with a policy matching `auth.user_id()`
 * against `user_id` — see `docs/neon-migration/01-schema.sql`. If you add a
 * table, it needs a policy, or it is world-readable.
 */

// Vite inlines VITE_* at BUILD time, so a missing variable on the host
// produces a white screen and a cryptic error from inside the SDK. Fail loudly
// and name the variable instead. On Vercel these live under Settings →
// Environment Variables, not in the local .env (gitignored, never uploaded).
function required(name: "VITE_NEON_DATABASE_URL"): string {
  const value = import.meta.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing ${name}. Set it in your host's environment variables (Vercel → Settings → Environment Variables) and redeploy. Locally, run \`neon deploy\` to pull it into .env.local, or copy .env.example.`,
    );
  }
  return value;
}

// The single-URL overload is mistyped in 0.7.0-beta — it declares `adapter`
// as an adapter *instance* where every other overload (correctly) wants the
// builder that `SupabaseAuthAdapter()` returns. Deriving the two URLs
// ourselves, with the library's own helper, uses the well-typed overload and
// avoids a cast. Collapse this back to the one-argument form once the typings
// are fixed.
const urls = defaultDeriveNeonUrls(required("VITE_NEON_DATABASE_URL"));

export const db = createClient<Database>({
  auth: { url: urls.auth, adapter: SupabaseAuthAdapter() },
  dataApi: { url: urls.dataApi },
});
