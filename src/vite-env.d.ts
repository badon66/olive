/// <reference types="vite/client" />

// Typed so a missing/renamed variable is a compile error rather than `any`
// silently flowing into createClient at runtime.
//
// One variable now, where Supabase needed two: Neon derives both the auth and
// Data API endpoints from this base URL, and the client manages the JWT, so
// there is no key to publish.
interface ImportMetaEnv {
  readonly VITE_NEON_DATABASE_URL: string;
  /** Base URL for the assistant / daily-brief / schedule-setup functions. */
  readonly VITE_FUNCTIONS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
