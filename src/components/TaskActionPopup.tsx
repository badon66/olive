import { useEffect, useRef, useState } from "react";
import type { Task } from "../hooks/useTasks";
import type { WeeklyTask } from "../hooks/useWeeklyTasks";
import { addDays } from "../lib/dates";
import { DatePickerPopup } from "./DatePickerPopup";
import { Portal } from "./Portal";

// DOUBLE-click gesture (BUILD_PLAN). It has to stay distinct from a single
// click, which opens the full edit modal — so the single-click action is held
// briefly and cancelled if a second click arrives. Without the delay the edit
// modal would already be covering the row when click 2 landed.
//
// Only the "open the editor" intent is delayed. Checkboxes, arrows and every
// other control stay immediate.
const MULTI_CLICK_MS = 220;

export function useDoubleClick(onSingle: () => void, onDouble: () => void) {
  const timer = useRef<number | null>(null);
  const clicks = useRef(0);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  return () => {
    clicks.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (clicks.current >= 2) {
      clicks.current = 0;
      onDouble();
      return;
    }
    timer.current = window.setTimeout(() => {
      clicks.current = 0;
      onSingle();
    }, MULTI_CLICK_MS);
  };
}

// What the popup is acting on. A weekly occurrence is a genuinely different
// thing from a task — it has no due_date of its own and skipping it must not
// disturb the recurring pattern — so it gets its own action set.
export type ActionTarget =
  | { kind: "task"; task: Task }
  | { kind: "weekly"; weekly: WeeklyTask; date: string };

export function TaskActionPopup({
  target,
  today,
  onClose,
  onUnschedule,
  onReschedule,
  onSkipWeekly,
}: {
  target: ActionTarget;
  today: string;
  onClose: () => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, date: string | null) => void;
  onSkipWeekly: (task: WeeklyTask, date: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = target.kind === "task" ? target.task.title : target.weekly.name;

  // "Skip for the day" pushes a regular task to tomorrow. Explicitly a no-op if
  // it is already sitting on tomorrow — skipping twice shouldn't march it into
  // next week by accident.
  const tomorrow = addDays(today, 1);
  const alreadyTomorrow = target.kind === "task" && target.task.due_date === tomorrow;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-void/85 backdrop-blur-sm p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="hud-modal p-5 w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Actions for ${label}`}
        >
          <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-1">
            {target.kind === "weekly" ? "Weekly task" : "Task actions"}
          </p>
          <p className="font-body font-semibold text-base mb-4 truncate">{label}</p>

          {picking ? (
            <div>
              <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-2">Reschedule to</p>
              <DatePickerPopup
                value={target.kind === "task" ? target.task.due_date : null}
                onChange={(d) => {
                  if (target.kind === "task") onReschedule(target.task.id, d);
                  onClose();
                }}
              />
              <button className="hud-button w-full mt-3 !border-signal-dim/40 !text-dim" onClick={() => setPicking(false)}>
                Back
              </button>
            </div>
          ) : target.kind === "weekly" ? (
            <div className="flex flex-col gap-2">
              {/* Deliberately the ONLY action for a weekly occurrence: it doesn't
                  own a due_date, so "delete for today" and "reschedule" have no
                  meaning here. Skipping marks just this day and leaves the
                  recurring pattern untouched. */}
              <button
                className="hud-button w-full"
                onClick={() => {
                  onSkipWeekly(target.weekly, target.date);
                  onClose();
                }}
              >
                Skip today
              </button>
              <p className="font-data text-[10px] text-dim/70 -mt-1 mb-1">
                Doesn't count as missed, and leaves the schedule unchanged.
              </p>
              <button className="hud-button w-full !border-signal-dim/40 !text-dim" onClick={onClose}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                className="hud-button w-full"
                onClick={() => {
                  onUnschedule(target.task.id);
                  onClose();
                }}
              >
                Delete for today
              </button>
              <button
                className="hud-button w-full disabled:opacity-40 disabled:cursor-default"
                disabled={alreadyTomorrow}
                title={alreadyTomorrow ? "Already on tomorrow" : "Push to tomorrow"}
                onClick={() => {
                  if (!alreadyTomorrow) onReschedule(target.task.id, tomorrow);
                  onClose();
                }}
              >
                Skip for the day
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
