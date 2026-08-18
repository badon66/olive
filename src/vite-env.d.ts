/// <reference types="vite/client" />

// Typed so a missing/renamed variable is a compile error rather than `any`
// silently flowing into createClient at runtime.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
