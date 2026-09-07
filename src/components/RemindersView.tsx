import { useEffect, useMemo, useState } from "react";
import type { Reminder, ReminderFire, ReminderStore } from "../hooks/useReminders";
import {
  countdownLabel,
  cycleSeconds,
  describeRecurrence,
  dueOccurrence,
  isExhausted,
  needsAttempt,
  nextFireAt,
  secondsUntil,
} from "../lib/reminders";
import { playSound, soundLabel, stopSound } from "../lib/sounds";
import { CountdownRing } from "./CountdownRing";
import { ReminderForm } from "./ReminderForm";
import { SkeletonRows } from "./Skeleton";

// How often we look for occurrences that have come due. The pg_cron tick runs
// every 5 minutes, which is far too coarse for "every 1 minute" — so an open
// browser scans for itself and both write the same idempotent fire rows.
const SCAN_MS = 10_000;
// How often the repeat cadence is evaluated. Fine-grained enough that a 20-second
// re-alert lands within a couple of seconds of its slot.
const BEAT_MS = 2_000;

// Alert engine (BUILD_PLAN). Two independent beats:
//   1. SCAN  — an occurrence came due, so record a fire row.
//   2. BEAT  — a pending fire still wants attention, so sound the alert.
// Splitting them is what makes repeat-until-dismissed work: the fire row is the
// durable thing, and the alert is just its current attempt.
export function useReminderAlerts(store: ReminderStore) {
  const { reminders, fires, globallyEnabled, raiseFire, recordAttempt, dismissFire } = store;

  const byId = useMemo(() => new Map(reminders.map((r) => [r.id, r])), [reminders]);

  // 1. Raise fire rows for whatever has come due.
  useEffect(() => {
    if (!globallyEnabled) return;
    const scan = () => {
      const now = new Date();
      for (const r of reminders) {
        if (!r.active) continue;
        const at = dueOccurrence(r, now);
        if (at) void raiseFire(r.id, at);
      }
    };
    scan();
    const iv = setInterval(scan, SCAN_MS);
    return () => clearInterval(iv);
  }, [reminders, globallyEnabled, raiseFire]);

  // 2. Sound each pending fire on its own cadence until dismissed or spent.
  useEffect(() => {
    if (!globallyEnabled) return;
    const beat = () => {
      const now = new Date();
      for (const f of fires) {
        const r = byId.get(f.reminder_id);
        if (!r) continue;
        if (!needsAttempt(f, r, now)) continue;
        playSound(r.sound_id, r.volume);
        void recordAttempt(f.id, f.repeat_count + 1);
      }
    };
    beat();
    const iv = setInterval(beat, BEAT_MS);
    return () => clearInterval(iv);
  }, [fires, byId, globallyEnabled, recordAttempt]);

  // What the user actually sees. An EXHAUSTED fire disappears: BUILD_PLAN is
  // explicit that once it gives up it "doesn't persist as an unresolved
  // notification" — it goes quiet until the next occurrence.
  const firing = useMemo(
    () =>
      fires
        .map((f) => ({ fire: f, reminder: byId.get(f.reminder_id) }))
        .filter((x): x is { fire: ReminderFire; reminder: Reminder } => !!x.reminder)
        .filter((x) => !isExhausted(x.fire, x.reminder)),
    [fires, byId],
  );

  return {
    firing: globallyEnabled ? firing : [],
    dismiss: (fireId: string, soundId: string) => {
      stopSound(soundId);
      void dismissFire(fireId);
    },
  };
}

// The alert itself. Stays up, re-sounding on its own cadence, until dismissed.
export function ReminderAlerts({
  firing,
  dismiss,
}: {
  firing: { fire: ReminderFire; reminder: Reminder }[];
  dismiss: (fireId: string, soundId: string) => void;
}) {
  if (firing.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {firing.map(({ fire, reminder }) => (
        <div
          key={fire.id}
          className="hud-modal !border-amber/60 p-3.5 shadow-[0_0_28px_rgba(255,180,84,0.3)]"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-amber shrink-0 mt-0.5 pulse-live"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-body font-semibold text-[15px] text-hud">{reminder.name}</p>
              {reminder.message && <p className="text-dim text-sm mt-0.5">{reminder.message}</p>}
              {/* Honest about how insistent it is being, and when it will stop. */}
              <p className="font-data text-[10px] text-dim/70 mt-1.5">
                alert {Math.max(1, fire.repeat_count)} of {reminder.max_repeats}
                {" · "}
                {reminder.repeat_interval_seconds}s apart
              </p>
            </div>
            <button
              onClick={() => dismiss(fire.id, reminder.sound_id)}
              aria-label={`Dismiss ${reminder.name}`}
              className="w-9 h-9 grid place-items-center text-dim hover:text-hud cursor-pointer rounded shrink-0 focus-visible:outline-2 focus-visible:outline-signal"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => dismiss(fire.id, reminder.sound_id)}
            className="hud-button w-full mt-2.5 !min-h-[38px] !border-amber/50 !text-amber hover:!bg-amber/10"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

// Next-fire summary for a row: the ring's target plus its full sweep.
function schedule(r: Reminder, now: Date) {
  if (!r.active) return { next: null, cycle: null };
  return { next: nextFireAt(r, now), cycle: cycleSeconds(r, now) };
}

function nextLabel(r: Reminder, now: Date): string {
  if (!r.active) return "paused";
  const next = nextFireAt(r, now);
  if (!next) return "done";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(next);
}

// Compact dashboard mini-panel. BUILD_PLAN: "bigger and richer per reminder,
// not a bare name" — each row carries its recurrence at a glance and its live
// countdown ring — while staying small and low-priority in the layout overall.
export function RemindersPanel({
  store,
  onAdd,
  onOpen,
}: {
  store: ReminderStore;
  onAdd?: () => void;
  onOpen?: (r: Reminder) => void;
}) {
  const [editing, setEditing] = useState<Reminder | null>(null);
  const now = useMemo(() => new Date(), []);
  const active = store.reminders.filter((r) => r.active);

  if (store.loading) return <SkeletonRows count={2} compact />;

  if (!store.globallyEnabled) {
    return (
      <p className="text-dim text-xs py-1">
        Reminders are switched off globally.
        {onAdd && (
          <button onClick={onAdd} className="ml-1 text-signal underline underline-offset-2 cursor-pointer">
            open Reminders
          </button>
        )}
      </p>
    );
  }

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
    .map((r) => ({ r, next: nextFireAt(r, now) }))
    .filter((x) => x.next !== null)
    .sort((a, b) => a.next!.getTime() - b.next!.getTime())
    .slice(0, 4);

  return (
    <>
      <ul className="divide-y divide-signal-dim/15">
        {soon.map(({ r }) => {
          const { next, cycle } = schedule(r, now);
          return (
            <li key={r.id}>
              {/* Clicking the row opens the standard edit modal — the same
                  pattern as everywhere else, no separate edit button first. */}
              <button
                onClick={() => (onOpen ? onOpen(r) : setEditing(r))}
                className="w-full flex items-center gap-2.5 py-2 text-left cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal hover:bg-signal/5"
                aria-label={`Edit ${r.name}`}
              >
                <CountdownRing target={next} cycle={cycle} size={34} stroke={2.5} showLabel={false} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-body text-[14px] text-hud">{r.name}</span>
                  <span className="block font-data text-[10px] text-dim truncate">{describeRecurrence(r)}</span>
                </span>
                <span className="hud-chip shrink-0">{nextLabel(r, now)}</span>
              </button>
            </li>
          );
        })}
      </ul>
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
    </>
  );
}

// Full sidebar tab.
export function RemindersView({ store }: { store: ReminderStore }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const { reminders, loading, globallyEnabled } = store;

  // Re-rendered once a second so the "next" chips stay honest; the rings
  // animate themselves at frame rate without involving React.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <SkeletonRows count={3} />;

  const activeCount = reminders.filter((r) => r.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-signal text-sm tracking-[0.25em] uppercase">Reminders</h1>
          <span className="hud-chip">{activeCount}</span>
        </div>
        <button className="hud-button px-4" onClick={() => setAdding(true)}>
          + New reminder
        </button>
      </div>

      {/* Global master switch (BUILD_PLAN) — one control for the whole feature,
          separate from each reminder's own active flag, and clearly labelled
          with its current state rather than being a bare toggle. */}
      <button
        onClick={() => void store.setGloballyEnabled(!globallyEnabled)}
        aria-pressed={globallyEnabled}
        className={`w-full hud-panel !border-l-[3px] p-3.5 flex items-center gap-3 cursor-pointer text-left transition-colors duration-200 ${
          globallyEnabled ? "!border-l-signal" : "!border-l-dim/40"
        }`}
      >
        <span
          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 ${
            globallyEnabled ? "bg-signal-dim" : "bg-panel-border"
          }`}
          aria-hidden="true"
        >
          {/* transform-only movement, per CLAUDE.md's motion rules */}
          <span
            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-hud transition-transform duration-200 ease-[var(--ease-spring)]"
            style={{ transform: globallyEnabled ? "translateX(20px)" : "translateX(0)" }}
          />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display text-[13px] tracking-[0.14em] uppercase text-hud">
            Reminders {globallyEnabled ? "Active" : "Off"}
          </span>
          <span className="block text-dim text-xs mt-0.5">
            {globallyEnabled
              ? "Everything below fires on schedule."
              : "Nothing fires — individual settings are ignored while this is off."}
          </span>
        </span>
      </button>

      <p className="text-dim text-xs">
        In-app alerts fire while Olive is open, repeating until dismissed. Delivery when you're away from the app
        arrives with the Telegram bot (Phase 8) — not faked with browser push in the meantime.
      </p>

      {reminders.length === 0 ? (
        <div className="hud-panel p-6 text-center text-dim">
          No reminders yet — say <span className="text-hud">"remind me to stretch every 30 minutes"</span> or use + New
          reminder.
        </div>
      ) : (
        // auto-fit per CLAUDE.md's "grid, not fixed columns" — scales past 2 cols
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-3 items-start">
          {reminders.map((r) => {
            const { next, cycle } = schedule(r, now);
            const left = secondsUntil(next, now);
            return (
              <div key={r.id} className={`hud-panel p-3.5 ${r.active && globallyEnabled ? "" : "opacity-55"}`}>
                <div className="flex items-start gap-3">
                  {/* The live ring: genuinely ticking, not a static number. */}
                  <CountdownRing target={next} cycle={cycle} size={52} stroke={3} />
                  <button
                    onClick={() => setEditing(r)}
                    className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                    aria-label={`Edit ${r.name}`}
                  >
                    <p className="font-body font-semibold text-[15px] truncate">{r.name}</p>
                    {r.message && <p className="text-dim text-sm truncate">{r.message}</p>}
                    <p className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="hud-chip hud-chip-signal">{describeRecurrence(r)}</span>
                      <span className="hud-chip">
                        {left !== null ? `in ${countdownLabel(left)}` : nextLabel(r, now)}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 mt-1 font-data text-[10px] text-dim/70">
                      <span>{soundLabel(r.sound_id)}</span>
                      <span>{Math.round(r.volume * 100)}%</span>
                      <span>
                        ×{r.max_repeats} / {r.repeat_interval_seconds}s
                      </span>
                    </p>
                  </button>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => void store.updateReminder(r.id, { active: !r.active })}
                      aria-pressed={r.active}
                      className={`font-data text-[10px] px-2 py-1 rounded border cursor-pointer transition-colors duration-200 ${
                        r.active
                          ? "border-signal/50 text-signal hover:bg-signal/10"
                          : "border-signal-dim/40 text-dim hover:border-signal-dim"
                      }`}
                    >
                      {r.active ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => playSound(r.sound_id, r.volume)}
                      aria-label={`Preview ${r.name} sound`}
                      title="Preview this reminder's sound"
                      className="h-7 grid place-items-center rounded border border-signal-dim/40 text-dim hover:text-signal hover:border-signal/50 cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
