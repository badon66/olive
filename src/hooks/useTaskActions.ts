import type { TaskStore } from "./useTasks";
import type { WeeklyStore } from "./useWeeklyTasks";
import { onDayPatch, skipDayPatch } from "../lib/flexible";
import type { TaskActionsProps } from "../components/TaskActionPopup";

// The quick actions' writes, defined ONCE for every surface that offers them —
// the desktop double-click popup and the phone's task sheet (BUILD_PLAN "same
// brain, different face"). Each is shape-aware (lib/flexible.ts), so a window
// or pick task is moved correctly however the action is reached.
export type TaskActionHandlers = Pick<
  TaskActionsProps,
  "onUnschedule" | "onReschedule" | "onSkipTask" | "onSkipWeekly" | "dayOverrides" | "onSetWeeklyOverride" | "onClearWeeklyOverride"
>;

export function taskActionHandlers(taskStore: TaskStore, weeklyStore: WeeklyStore): TaskActionHandlers {
  return {
    // "Delete for today" = off the schedule, not destroyed. The task drops back
    // to its category's backlog with no due date. It clears the WHOLE
    // scheduling state, because a leftover window or candidate list would keep
    // the task appearing on every day of a set the user has just dismissed.
    onUnschedule: (id) =>
      void taskStore.updateTask(id, {
        due_date: null,
        window_start: null,
        window_end: null,
        candidate_dates: null,
        completed_dates: null,
      }),
    // Choosing a date means "it's happening on that day": a window or pick task
    // becomes a single-day task there. Rewriting due_date alone moved nothing
    // and corrupted the deadline.
    onReschedule: (id, date) => void taskStore.updateTask(id, onDayPatch(date)),
    onSkipTask: (task, day) => void taskStore.updateTask(task.id, skipDayPatch(task, day)),
    onSkipWeekly: (w, date) => void weeklyStore.skipDay(w.id, date),
    dayOverrides: weeklyStore.dayOverrides,
    // Gated on the table actually existing, so the per-day editor never appears
    // somewhere it could not save.
    onSetWeeklyOverride: weeklyStore.overridesReady
      ? (id, date, patch) => weeklyStore.setDayOverride(id, date, patch)
      : undefined,
    onClearWeeklyOverride: weeklyStore.overridesReady ? (id, date) => weeklyStore.clearDayOverride(id, date) : undefined,
  };
}
