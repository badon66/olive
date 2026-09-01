import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { submitScheduleSetup, type BlockedWindow } from "../lib/api";
import { addDays, edmontonToday } from "../lib/dates";
import { ChatBar } from "./ChatBar";
import { Portal } from "./Portal";
import { useEscape } from "./useEscape";

type Setup = {
  wake_time: string;
  bedtime: string | null;
  going_selling: boolean;
  blocked_windows: BlockedWindow[];
};

// "Set up tomorrow's schedule" — a manual icon (replaces a nightly auto-prompt).
// Opens a proper form: wake time, bedtime, blocked windows (voice), a "going
// selling" flag, and an in-popup task adder for tomorrow. Shows set/not-set.
export function ScheduleSetupButton({ onTasksChanged }: { onTasksChanged?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  useEscape(() => setOpen(false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Setup | null>(null);
  const [wake, setWake] = useState("");
  const [bedtime, setBedtime] = useState("");
  const [blocked, setBlocked] = useState("");
  const [goingSelling, setGoingSelling] = useState(false);
  const tomorrow = addDays(edmontonToday(), 1);

  const check = useCallback(async () => {
    const { data } = await supabase
      .from("daily_schedule_setup")
      .select("wake_time, bedtime, blocked_windows, going_selling")
      .eq("date", tomorrow)
      .maybeSingle();
    if (data) {
      setDone({
        wake_time: data.wake_time,
        bedtime: data.bedtime,
        going_selling: data.going_selling,
        blocked_windows: (data.blocked_windows ?? []) as BlockedWindow[],
      });
      setWake(data.wake_time?.slice(0, 5) ?? "");
      setBedtime(data.bedtime?.slice(0, 5) ?? "");
      setGoingSelling(data.going_selling);
    } else {
      setDone(null);
    }
  }, [tomorrow]);

  useEffect(() => {
    void check();
  }, [check]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitScheduleSetup({
        date: tomorrow,
        wake_time: wake || null,
        bedtime: bedtime || null,
        going_selling: goingSelling,
        blocked_windows_blurb: blocked.trim(),
      });
      setDone({
        wake_time: result.wake_time,
        bedtime: result.bedtime,
        going_selling: result.going_selling,
        blocked_windows: result.blocked_windows,
      });
      setBlocked("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="flex-1 block space-y-1">
      <span className="font-data text-xs text-dim uppercase tracking-wider">{label}</span>
      {node}
    </label>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Set up tomorrow's schedule"
        className={`inline-flex items-center gap-2 px-3 min-h-[36px] rounded-lg border font-data text-[11px] tracking-wide cursor-pointer transition duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
          done
            ? "border-signal/45 text-signal hover:shadow-[0_0_12px_rgba(63,169,104,0.25)]"
            : "border-amber/45 text-amber hover:shadow-[0_0_12px_rgba(255,180,84,0.25)]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v6M4.2 10.2l1.4 1.4M1 16h2M21 16h2M18.4 11.6l1.4-1.4M22 20H2M8 16a4 4 0 0 1 8 0" />
        </svg>
        tomorrow: {done ? "set up" : "not set up"}
      </button>

      {open && (
        <Portal>
        {/* Portal is load-bearing: on desktop this button lives inside the sticky
            header, whose backdrop-blur-md made IT the containing block — the
            "fullscreen" overlay rendered as a 66px strip pinned to the header
            (measured live) instead of covering the viewport. Top-aligned rather
            than centered is deliberate (BUILD_PLAN allows "centered or top"). */}
        <div
          className="fixed inset-0 z-50 grid justify-items-center items-start bg-void/85 backdrop-blur-sm p-4 pt-[7vh] overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Set up tomorrow's schedule"
        >
          <div className="hud-modal w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">Set up tomorrow</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-3">
              {field("Wake up", <input className="hud-input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />)}
              {field("Bedtime", <input className="hud-input" type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />)}
            </div>

            {field(
              "Blocked windows (type or dictate)",
              <textarea
                className="hud-input resize-y"
                rows={2}
                placeholder="e.g. dentist 2 to 3:30, gym 6 to 7"
                value={blocked}
                onChange={(e) => setBlocked(e.target.value)}
              />,
            )}

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={goingSelling} onChange={(e) => setGoingSelling(e.target.checked)} className="w-5 h-5 accent-signal cursor-pointer" />
              <span className="font-body text-sm text-hud">Planning to go selling</span>
            </label>

            {error && <p className="text-amber text-sm">Couldn't save — {error}</p>}

            {done && (
              <div className="border border-panel-border rounded-lg p-3 space-y-1">
                <p className="font-data text-[11px] text-dim uppercase tracking-wider">Currently set for {tomorrow}</p>
                <p className="flex flex-wrap gap-1.5">
                  <span className="hud-chip hud-chip-signal">wake {done.wake_time.slice(0, 5)}</span>
                  {done.bedtime && <span className="hud-chip hud-chip-signal">bed {done.bedtime.slice(0, 5)}</span>}
                  {done.going_selling && <span className="hud-chip hud-chip-signal">selling</span>}
                  {done.blocked_windows.map((w, i) => (
                    <span key={i} className="hud-chip hud-chip-amber">
                      ⛔ {w.start}–{w.end} {w.label}
                    </span>
                  ))}
                  {done.blocked_windows.length === 0 && <span className="hud-chip">no blocked windows</span>}
                </p>
              </div>
            )}

            <button className={`hud-button hud-button-primary w-full ${busy ? "pulse-live" : ""}`} disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : done ? "Update setup" : "Save setup"}
            </button>

            {/* Task adder — same capture pattern as the main bar; undated tasks
                default to tomorrow (voice/mic supported via dictation). */}
            <div className="border-t border-panel-border pt-3 space-y-1.5">
              <p className="font-data text-xs text-dim uppercase tracking-wider">Add tasks for tomorrow</p>
              <ChatBar
                inline
                forDate={tomorrow}
                onActionDone={async () => {
                  await onTasksChanged?.();
                }}
              />
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
