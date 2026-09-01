import { SkeletonRows } from "./Skeleton";
import { useEffect, useState } from "react";
import type { Reminder, ReminderStore } from "../hooks/useReminders";
import { describeRecurrence, dueReminders, nextFireAt } from "../lib/reminders";
import { ReminderForm } from "./ReminderForm";

// How often the in-app checker re-evaluates what's due.
const TICK_MS = 20_000;

// Fires in-app alerts for due reminders while the app is open. Reliable delivery
// while away from the screen is the Telegram bot (Phase 8) — deliberately NOT
// faked with browser push here.
export function useReminderAlerts(store: ReminderStore) {
  const [firing, setFiring] = useState<Reminder[]>([]);

  useEffect(() => {
    const check = () => {
      const due = dueReminders(store.reminders, new Date());
      if (due.length === 0) return;
      setFiring((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...due.filter((r) => !seen.has(r.id))];
      });
      // Stamp immediately so a repeating reminder doesn't re-alert every tick.
      for (const r of due) void store.markFired(r.id);
    };
    check();
    const iv = setInterval(check, TICK_MS);
    return () => clearInterval(iv);
  }, [store]);

  return { firing, dismiss: (id: string) => setFiring((p) => p.filter((r) => r.id !== id)) };
}

// The alert itself — visual, plus a short tone when the browser allows it.
export function ReminderAlerts({ firing, dismiss }: { firing: Reminder[]; dismiss: (id: string) => void }) {
  useEffect(() => {
    if (firing.length === 0) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio is a nicety — a blocked AudioContext must never break the alert.
    }
  }, [firing.length]);

  if (firing.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {firing.map((r) => (
        <div key={r.id} className="hud-panel !border-amber/60 p-3 shadow-[0_0_24px_rgba(255,180,84,0.25)]" role="alert">
          <div className="flex items-start gap-2.5">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-body font-semibold text-[15px] text-hud">{r.name}</p>
              {r.message && <p className="text-dim text-sm mt-0.5">{r.message}</p>}
            </div>
            <button
              onClick={() => dismiss(r.id)}
              aria-label={`Dismiss ${r.name}`}
              className="w-7 h-7 grid place-items-center text-dim hover:text-hud cursor-pointer rounded shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function nextLabel(r: Reminder): string {
  if (!r.active) return "paused";
  const next = nextFireAt(r, new Date());
  if (!next) return "done";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(next);
}

// Compact dashboard mini-panel: what's coming, nothing more. Deliberately small
// and low-priority per the spec.
export function RemindersPanel({ store, onAdd }: { store: ReminderStore; onAdd?: () => void }) {
  const active = store.reminders.filter((r) => r.active);
  if (active.length === 0) {
    return (
      <p className="text-dim text-xs py-1">
        No reminders — say "remind me to stretch every 30 minutes".
        {onAdd && (
          <button onClick={onAdd} className="ml-1 text-signal underline underline-offset-2 cursor-pointer">
            add one
          </button>
        )}
      </p>
    );
  }
  const soon = [...active]
    .map((r) => ({ r, next: nextFireAt(r, new Date()) }))
    .filter((x) => x.next !== null)
    .sort((a, b) => a.next!.getTime() - b.next!.getTime())
    .slice(0, 4);

  return (
    <ul className="divide-y divide-signal-dim/15">
      {soon.map(({ r }) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 truncate font-body text-[13px]">{r.name}</span>
          <span className="hud-chip shrink-0">{nextLabel(r)}</span>
        </li>
      ))}
    </ul>
  );
}

// Full sidebar tab.
export function RemindersView({ store }: { store: ReminderStore }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const { reminders, loading } = store;

  if (loading) return <SkeletonRows count={3} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-signal text-sm tracking-[0.25em] uppercase">Reminders</h1>
          <span className="hud-chip">{reminders.filter((r) => r.active).length}</span>
        </div>
        <button className="hud-button px-4" onClick={() => setAdding(true)}>
          + New reminder
        </button>
      </div>

      <p className="text-dim text-xs">
        In-app alerts fire while Olive is open. Delivery when you're away from the app arrives with the Telegram bot
        (Phase 8) — not faked with browser push in the meantime.
      </p>

      {reminders.length === 0 ? (
        <div className="hud-panel p-6 text-center text-dim">
          No reminders yet — say <span className="text-hud">"remind me to stretch every 30 minutes"</span> or use + New
          reminder.
        </div>
      ) : (
        // auto-fit per CLAUDE.md's "grid, not fixed columns" — scales past 2 cols
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-3 items-start">
          {reminders.map((r) => (
            <div key={r.id} className={`hud-panel p-3.5 ${r.active ? "" : "opacity-55"}`}>
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setEditing(r)}
                  className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                  aria-label={`Edit ${r.name}`}
                >
                  <p className="font-body font-semibold text-[15px] truncate">{r.name}</p>
                  {r.message && <p className="text-dim text-sm truncate">{r.message}</p>}
                  <p className="flex items-center gap-2 mt-1">
                    <span className="hud-chip hud-chip-signal">{describeRecurrence(r)}</span>
                    <span className="hud-chip">next {nextLabel(r)}</span>
                  </p>
                </button>
                <button
                  onClick={() => void store.updateReminder(r.id, { active: !r.active })}
                  aria-pressed={r.active}
                  className={`shrink-0 font-data text-[10px] px-2 py-1 rounded border cursor-pointer transition-colors duration-200 ${
                    r.active
                      ? "border-signal/50 text-signal hover:bg-signal/10"
                      : "border-signal-dim/40 text-dim hover:border-signal-dim"
                  }`}
                >
                  {r.active ? "Active" : "Paused"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <ReminderForm
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await store.addReminder(input);
          }}
        />
      )}
      {editing && (
        <ReminderForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await store.updateReminder(editing.id, input);
          }}
          onDelete={async () => {
            await store.deleteReminder(editing.id);
          }}
        />
      )}
    </div>
  );
}
