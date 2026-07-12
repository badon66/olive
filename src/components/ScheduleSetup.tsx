import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { submitScheduleSetup, type BlockedWindow } from "../lib/api";
import { addDays, edmontonToday } from "../lib/dates";

// "Set up tomorrow's schedule" — a manual icon (replaces a nightly auto-prompt).
// One blurb covers wake time AND blocked windows; parsed server-side into
// daily_schedule_setup. Shows Completed/Uncompleted for tomorrow.
export function ScheduleSetupButton() {
  const [open, setOpen] = useState(false);
  const [blurb, setBlurb] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ wake_time: string; blocked_windows: BlockedWindow[] } | null>(null);
  const tomorrow = addDays(edmontonToday(), 1);

  const check = useCallback(async () => {
    const { data } = await supabase
      .from("daily_schedule_setup")
      .select("wake_time, blocked_windows")
      .eq("date", tomorrow)
      .maybeSingle();
    setDone(data ? { wake_time: data.wake_time, blocked_windows: (data.blocked_windows ?? []) as BlockedWindow[] } : null);
  }, [tomorrow]);

  useEffect(() => {
    void check();
  }, [check]);

  const submit = async () => {
    if (!blurb.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitScheduleSetup(blurb.trim());
      setDone({ wake_time: result.wake_time, blocked_windows: result.blocked_windows });
      setBlurb("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "parsing failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Set up tomorrow's schedule"
        className={`inline-flex items-center gap-2 px-3 min-h-[36px] rounded-lg border font-data text-[11px] tracking-wide cursor-pointer transition-all duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
          done
            ? "border-signal/45 text-signal hover:shadow-[0_0_12px_rgba(63,169,104,0.25)]"
            : "border-amber/45 text-amber hover:shadow-[0_0_12px_rgba(255,180,84,0.25)]"
        }`}
      >
        {/* sunrise icon */}
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v6M4.2 10.2l1.4 1.4M1 16h2M21 16h2M18.4 11.6l1.4-1.4M22 20H2M8 16a4 4 0 0 1 8 0" />
        </svg>
        tomorrow: {done ? "set up" : "not set up"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Set up tomorrow's schedule"
        >
          <div className="hud-panel w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">Set up tomorrow's schedule</h2>
            <p className="text-dim text-sm">
              One quick blurb — wake time and anything blocked. e.g. “Up around 9, dentist 2 to 3:30, don't schedule
              then.” Dictation works.
            </p>
            <textarea
              className="hud-input resize-y"
              rows={3}
              placeholder="Up around 9, dentist 2 to 3:30…"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              autoFocus
            />
            {error && <p className="text-amber text-sm">Couldn't parse that — {error}</p>}

            {done && (
              <div className="border border-panel-border rounded-lg p-3 space-y-1">
                <p className="font-data text-[11px] text-dim uppercase tracking-wider">Currently set for {tomorrow}</p>
                <p className="flex flex-wrap gap-1.5">
                  <span className="hud-chip hud-chip-signal">wake {done.wake_time.slice(0, 5)}</span>
                  {done.blocked_windows.map((w, i) => (
                    <span key={i} className="hud-chip hud-chip-amber">
                      ⛔ {w.start}–{w.end} {w.label}
                    </span>
                  ))}
                  {done.blocked_windows.length === 0 && <span className="hud-chip">no blocked windows</span>}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button className="hud-button !border-signal-dim/40 !text-dim px-4" onClick={() => setOpen(false)}>
                Close
              </button>
              <button className={`hud-button hud-button-primary flex-1 ${busy ? "pulse-live" : ""}`} disabled={busy || !blurb.trim()} onClick={() => void submit()}>
                {busy ? "Parsing…" : done ? "Replace setup" : "Set up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
