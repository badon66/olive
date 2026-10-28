import { useEffect, useRef, useState } from "react";
import type { Task } from "../hooks/useTasks";
import type { WeeklyTask } from "../hooks/useWeeklyTasks";
import { addDays, formatCompleted, fullDateLabel } from "../lib/dates";
import { SECTION_ORDER, sectionOptionLabel, type TimeSection } from "../lib/sections";
import { daysLeft, daysLeftLabel, skipIsPointless, spanLabel } from "../lib/flexible";
import { findDayOverride, type DayOverrideLike, type OverridePatch } from "../lib/weekly";
import { DatePickerPopup } from "./DatePickerPopup";
import { ModalShell } from "./ModalShell";

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
  // `date`: the day the row was double-clicked on (defaults to today).
  | { kind: "task"; task: Task; date?: string }
  | { kind: "weekly"; weekly: WeeklyTask; date: string };

// The quick actions themselves, with no container of its own: the desktop
// popup wraps it in a centred modal, and the phone's task sheet embeds it under
// the task's details and checklist (BUILD_PLAN: the same actions on both).
export type TaskActionsProps = {
  target: ActionTarget;
  today: string;
  onClose: () => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, date: string | null) => void;
  onSkipTask?: (task: Task, day: string) => void;
  onSkipWeekly: (task: WeeklyTask, date: string) => void;
  dayOverrides?: DayOverrideLike[];
  onSetWeeklyOverride?: (taskId: string, date: string, patch: OverridePatch) => void | Promise<void>;
  onClearWeeklyOverride?: (taskId: string, date: string) => void | Promise<void>;
  // Embedded in a sheet that already shows the title and span: hide the
  // header and the Cancel button (the sheet has its own dismissal).
  embedded?: boolean;
  // Phone: an "Edit" button that opens the full form.
  onEdit?: () => void;
};

export function TaskActionsBody({
  target,
  today,
  onClose,
  onUnschedule,
  onReschedule,
  onSkipTask,
  onSkipWeekly,
  dayOverrides = [],
  onSetWeeklyOverride,
  onClearWeeklyOverride,
  embedded = false,
  onEdit,
}: TaskActionsProps & {
  target: ActionTarget;
  today: string;
  onClose: () => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, date: string | null) => void;
  // "Skip for the day" on the day the task was shown. Shape-aware (skipDayPatch):
  // a window drops that day, a pick task drops that date, a fixed task moves on.
  onSkipTask?: (task: Task, day: string) => void;
  onSkipWeekly: (task: WeeklyTask, date: string) => void;
  // One-day-only occurrence tweaks. Optional so the popup still works anywhere
  // the override store isn't wired up.
  dayOverrides?: DayOverrideLike[];
  onSetWeeklyOverride?: (taskId: string, date: string, patch: OverridePatch) => void | Promise<void>;
  onClearWeeklyOverride?: (taskId: string, date: string) => void | Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [editingDay, setEditingDay] = useState(false);

  const existing =
    target.kind === "weekly" ? findDayOverride(target.weekly.id, dayOverrides, target.date) : null;
  const [dayName, setDayName] = useState(existing?.name ?? "");
  const [daySection, setDaySection] = useState<TimeSection | "">(existing?.time_section ?? "");
  const [dayTime, setDayTime] = useState(existing?.scheduled_time?.slice(0, 5) ?? "");

  // Show what this occurrence is actually called on this day, override included.
  const label = target.kind === "task" ? target.task.title : (existing?.name ?? target.weekly.name);

  // The day this action is about: the row's own day, which is not necessarily
  // today — the schedule can be stepped to any day.
  const shownDay = target.kind === "task" ? (target.date ?? today) : target.date;
  // Refused only when it would change nothing: a single-day task already on the
  // next day. A window ending tomorrow still has its current day to drop — it
  // used to be refused with "Already on tomorrow" while sitting on today.
  const skipPointless = target.kind === "task" && skipIsPointless(target.task, shownDay);
  const weekdayOf = (iso: string) => fullDateLabel(iso).split(",")[0];
  // A range task's popup shows its whole span, date to date — the rows only
  // ever say how many days are left (BUILD_PLAN days-left rule).
  const span = target.kind === "task" ? spanLabel(target.task) : null;
  // A completed range task reads as completed here too, never "overdue".
  const spanNote =
    target.kind === "task" && span
      ? target.task.status === "completed"
        ? formatCompleted(target.task.completed_at, today)
        : daysLeftLabel(daysLeft(target.task, today) ?? 0)
      : null;

  const editButton = onEdit && (
    <button className="hud-button w-full" onClick={onEdit}>
      Edit
    </button>
  );

  return (
        <>
          {!embedded && (
            <>
              <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-1">
                {target.kind === "weekly" ? "Weekly task" : "Task actions"}
              </p>
              <p className={`font-body font-semibold text-base truncate ${span ? "mb-1" : "mb-4"}`}>{label}</p>
              {span && (
                <p className="font-data text-[11px] text-signal mb-4" aria-label="Scheduled span">
                  {span}
                  {spanNote && <span className="text-dim"> · {spanNote}</span>}
                </p>
              )}
            </>
          )}

          {picking ? (
            <div>
              <p className="font-data text-[11px] uppercase tracking-widest text-dim mb-2">Reschedule to</p>
              <DatePickerPopup
                completedAt={
                  target.kind === "task" && target.task.status === "completed" ? target.task.completed_at : null
                }
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
            editingDay ? (
              /* One-day-only edit. Everything here writes to
                 weekly_task_day_overrides for this date alone — the recurrence
                 pattern, every other day, and the week's totals are untouched. */
              <div className="flex flex-col gap-3">
                <p className="font-data text-[10px] uppercase tracking-widest text-amber/80">
                  Just for {fullDateLabel(target.date)}
                </p>
                <label className="block space-y-1">
                  <span className="font-data text-xs text-dim uppercase tracking-wider">Name</span>
                  <input
                    className="hud-input"
                    value={dayName}
                    onChange={(e) => setDayName(e.target.value)}
                    placeholder={target.weekly.name}
                    aria-label="Name for this day only"
                  />
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 block space-y-1">
                    <span className="font-data text-xs text-dim uppercase tracking-wider">Part of day</span>
                    <select
                      className="hud-input cursor-pointer"
                      value={daySection}
                      onChange={(e) => setDaySection(e.target.value as TimeSection | "")}
                      aria-label="Part of day for this day only"
                    >
                      <option value="" className="bg-void">As usual</option>
                      {SECTION_ORDER.map((s) => (
                        <option key={s} value={s} className="bg-void">
                          {sectionOptionLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex-1 block space-y-1">
                    <span className="font-data text-xs text-dim uppercase tracking-wider">Time</span>
                    <input
                      className="hud-input"
                      type="time"
                      value={dayTime}
                      onChange={(e) => setDayTime(e.target.value)}
                      aria-label="Exact time for this day only"
                    />
                  </label>
                </div>
                <p className="font-data text-[10px] text-dim/70 -mt-1">
                  Leave a field blank to keep it as normal. This day only — the weekly pattern is untouched.
                </p>
                <button
                  className="hud-button w-full"
                  onClick={() => {
                    void onSetWeeklyOverride?.(target.weekly.id, target.date, {
                      name: dayName,
                      time_section: daySection || null,
                      scheduled_time: dayTime || null,
                    });
                    onClose();
                  }}
                >
                  Save for this day
                </button>
                {existing && (
                  <button
                    className="hud-button w-full !border-amber/40 !text-amber"
                    onClick={() => {
                      void onClearWeeklyOverride?.(target.weekly.id, target.date);
                      onClose();
                    }}
                  >
                    Reset to normal
                  </button>
                )}
                <button
                  className="hud-button w-full !border-signal-dim/40 !text-dim"
                  onClick={() => setEditingDay(false)}
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* A weekly occurrence owns no due_date, so "delete for today" and
                    "reschedule" have no meaning here. What it does support is
                    skipping the day, or tweaking just this one occurrence. */}
                <button
                  className="hud-button w-full"
                  onClick={() => {
                    onSkipWeekly(target.weekly, target.date);
                    onClose();
                  }}
                >
                  {target.date === today ? "Skip today" : `Skip ${weekdayOf(target.date)}`}
                </button>
                <p className="font-data text-[10px] text-dim/70 -mt-1 mb-1">
                  Doesn't count as missed, and leaves the schedule unchanged.
                </p>
                {onSetWeeklyOverride && (
                  <>
                    <button className="hud-button w-full" onClick={() => setEditingDay(true)}>
                      {existing ? "Edit this day's version" : "Change just for this day"}
                    </button>
                    <p className="font-data text-[10px] text-dim/70 -mt-1 mb-1">
                      Rename it, move it to another part of the day, or pin a time — for this day only.
                    </p>
                  </>
                )}
                {editButton}
                {!embedded && (
                  <button className="hud-button w-full !border-signal-dim/40 !text-dim" onClick={onClose}>
                    Cancel
                  </button>
                )}
              </div>
            )
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
                disabled={skipPointless}
                title={skipPointless ? "Already on the next day" : "Take it off this day"}
                onClick={() => {
                  if (!skipPointless) {
                    if (onSkipTask) onSkipTask(target.task, shownDay);
                    else onReschedule(target.task.id, addDays(shownDay, 1));
                  }
                  onClose();
                }}
              >
                Skip for the day
              </button>
              <button className="hud-button w-full" onClick={() => setPicking(true)}>
                Reschedule
              </button>
              {editButton}
              {!embedded && (
                <button className="hud-button w-full !border-signal-dim/40 !text-dim" onClick={onClose}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </>
  );
}

// Desktop: the quick actions in a centred popup (a bottom sheet on the phone,
// via ModalShell). Opened by double-clicking a row.
export function TaskActionPopup(props: TaskActionsProps) {
  const label = props.target.kind === "task" ? props.target.task.title : props.target.weekly.name;
  return (
    <ModalShell label={`Actions for ${label}`} onClose={props.onClose} size="sm" className="p-5">
      <TaskActionsBody {...props} />
    </ModalShell>
  );
}
