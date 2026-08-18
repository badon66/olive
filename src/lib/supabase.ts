import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Vite inlines VITE_* at BUILD time, so a missing variable on the host produces
// a white screen with a cryptic "supabaseUrl is required" from inside the SDK.
// Fail loudly and name the variable instead — on Vercel these are set under
// Settings → Environment Variables, not from the local .env (which is gitignored
// and never uploaded). See .env.example.
function required(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const value = import.meta.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing ${name}. Set it in your host's environment variables (Vercel → Settings → Environment Variables) and redeploy. Locally, copy .env.example to .env.local.`,
    );
  }
  return value;
}

export const supabase = createClient<Database>(
  required("VITE_SUPABASE_URL"),
  required("VITE_SUPABASE_ANON_KEY"),
);
