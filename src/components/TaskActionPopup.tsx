import { useEffect, useRef, useState } from "react";
import type { Task } from "../hooks/useTasks";
import { DatePickerPopup } from "./DatePickerPopup";
import { Portal } from "./Portal";

// Triple-click gesture (BUILD_PLAN): a DISTINCT gesture from a single click,
// which opens the full edit modal. To keep them distinct, the single-click
// action is held briefly and cancelled if more clicks arrive — otherwise the
// edit modal would already be covering the card by the time click 3 lands.
//
// The delay only applies to opening the edit modal. Checkboxes, arrows, and
// every other control stay immediate.
const MULTI_CLICK_MS = 240;

export function useTripleClick(onSingle: () => void, onTriple: () => void) {
  const timer = useRef<number | null>(null);
  const clicks = useRef(0);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  return () => {
    clicks.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);

    if (clicks.current >= 3) {
      clicks.current = 0;
      onTriple();
      return;
    }
    timer.current = window.setTimeout(() => {
      // Settled: one or two clicks means the ordinary "open the editor" intent.
      clicks.current = 0;
      onSingle();
    }, MULTI_CLICK_MS);
  };
}

// The two-option popup itself. "Delete for today" unschedules the task (clears
// its due date) rather than destroying the row — the task returns to its
// category's backlog. Permanent deletion still lives in the full edit modal.
export function TaskActionPopup({
  task,
  onClose,
  onUnschedule,
  onReschedule,
}: {
  task: Task;
  onClose: () => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, date: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-void/70 backdrop-blur-sm p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="hud-panel p-5 w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Actions for ${task.title}`}
        >
          <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-1">Task actions</p>
          <p className="font-body font-semibold text-base mb-4 truncate">{task.title}</p>

          {picking ? (
            <div>
              <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-2">Reschedule to</p>
              <DatePickerPopup
                value={task.due_date}
                onChange={(d) => {
                  onReschedule(task.id, d);
                  onClose();
                }}
              />
              <button
                className="hud-button w-full mt-3 !border-signal-dim/40 !text-dim"
                onClick={() => setPicking(false)}
              >
                Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                className="hud-button w-full"
                onClick={() => {
                  onUnschedule(task.id);
                  onClose();
                }}
              >
                Delete for today
              </button>
              <button className="hud-button w-full" onClick={() => setPicking(true)}>
                Reschedule
              </button>
              <button className="hud-button w-full !border-signal-dim/40 !text-dim" onClick={onClose}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
