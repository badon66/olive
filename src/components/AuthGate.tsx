import { useEffect, useState, type FormEvent, type ReactNode } from "react";
// The Supabase-compatible auth adapter returns a Supabase-shaped session, so
// the type comes from the same package the adapter mirrors. It stays a
// dependency for this type alone until auth moves to Better Auth natively.
import type { Session } from "@supabase/supabase-js";
import { db } from "../lib/db";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (session) return <>{children}</>;

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db.auth.signInWithPassword({ email, password });
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
