import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready)
    return (
      // Cold-start state — the first thing seen on every PWA launch. A bare
      // `null` here was a literal black screen until the session check resolved.
      <div className="min-h-dvh grid place-items-center bg-void">
        <p className="font-display text-signal text-2xl tracking-[0.4em] text-glow pulse-live">OLIVE</p>
      </div>
    );
  if (session) return <>{children}</>;

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={signIn} className="hud-panel w-full max-w-sm p-6 space-y-4">
        <h1 className="font-display text-signal text-xl tracking-[0.3em]">OLIVE</h1>
        <input
          className="hud-input"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="hud-input"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-critical text-sm">{error}</p>}
        <button className="hud-button w-full" disabled={busy}>
          {busy ? "…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
