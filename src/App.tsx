import { useState } from "react";
import { AuthGate } from "./components/AuthGate";

type View = "brief" | "tasks";

export default function App() {
  const [view, setView] = useState<View>("brief");

  return (
    <AuthGate>
      <div className="min-h-dvh flex flex-col">
        <header className="p-4 flex items-baseline justify-between">
          <h1 className="font-display text-signal text-lg tracking-[0.3em]">OLIVE</h1>
        </header>

        <main className="flex-1 px-4 pb-40">
          {view === "brief" ? (
            <p className="text-dim">Brief view — coming in Task 10.</p>
          ) : (
            <p className="text-dim">Tasks view — coming in Task 7.</p>
          )}
        </main>

        <nav className="fixed bottom-0 inset-x-0 flex">
          {(["brief", "tasks"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-3 font-display text-xs tracking-[0.2em] uppercase ${
                view === v ? "text-signal" : "text-dim"
              }`}
            >
              {v}
            </button>
          ))}
        </nav>
      </div>
    </AuthGate>
  );
}
