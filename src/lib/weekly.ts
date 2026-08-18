import { addDays } from "./dates";

// Weekly task cube model (BUILD_PLAN Phase 2): 7 cubes Monday-first, each
// day's state independent. fixed_days tasks auto-light their scheduled
// weekdays as "planned" with no checkin rows; count-mode tasks are planned
// manually (drag onto a day). Completing writes a checkin for that date only.

export type CubeState = "empty" | "planned" | "completed";

type WeeklyTaskLike = {
  recurrence_mode: "count" | "fixed_days";
  scheduled_days: number[] | null;
  target_per_week: number | null;
};
type CheckinLike = { date: string; status: "planned" | "completed" };

export function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
}

export function mondayOf(iso: string): string {
  return addDays(iso, -mondayIndex(iso));
}

// Monday-first dates of the week containing `today`
export function weekDates(today: string): string[] {
  const mon = mondayOf(today);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

export function cubeStates(task: WeeklyTaskLike, checkins: CheckinLike[], today: string): CubeState[] {
  const week = weekDates(today);
  return week.map((date, idx) => {
    const row = checkins.find((c) => c.date === date);
    if (row) return row.status;
    if (task.recurrence_mode === "fixed_days" && (task.scheduled_days ?? []).includes(idx)) return "planned";
    return "empty";
  });
}

export type Progress = { target: number; planned: number; completed: number; toPlan: number };

// Numbers must always be internally consistent: planned + completed + toPlan = target
// (toPlan floors at 0 when ahead of target).
export function progress(task: WeeklyTaskLike, states: CubeState[]): Progress {
  const planned = states.filter((s) => s === "planned").length;
  const completed = states.filter((s) => s === "completed").length;
  const target =
    task.recurrence_mode === "fixed_days" ? (task.scheduled_days ?? []).length : (task.target_per_week ?? 0);
  return { target, planned, completed, toPlan: Math.max(0, target - planned - completed) };
}

// Whether the task belongs in Today's schedule (BUILD_PLAN Phase 2):
// fixed_days → on its scheduled weekdays; count → until the week's target is met.
// True when this weekly task belongs to `date`. Date-generic on purpose — it is
// what lets any viewed day (not just today) render its weekly tasks inline.
export function appearsOn(task: WeeklyTaskLike, checkins: CheckinLike[], date: string): boolean {
  if (task.recurrence_mode === "fixed_days") {
    return (task.scheduled_days ?? []).includes(mondayIndex(date));
  }
  const week = new Set(weekDates(date));
  const completedThisWeek = checkins.filter((c) => c.status === "completed" && week.has(c.date)).length;
  return completedThisWeek < (task.target_per_week ?? 0);
}
