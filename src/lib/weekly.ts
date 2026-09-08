import { addDays } from "./dates";

// Weekly task cube model (BUILD_PLAN Phase 2): 7 cubes Monday-first, each
// day's state independent. fixed_days tasks auto-light their scheduled
// weekdays as "planned" with no checkin rows; count-mode tasks are planned
// manually (drag onto a day). Completing writes a checkin for that date only.

export type CubeState = "empty" | "planned" | "completed" | "skipped";

type WeeklyTaskLike = {
  recurrence_mode: "count" | "fixed_days";
  scheduled_days: number[] | null;
  target_per_week: number | null;
  // Paused indefinitely (BUILD_PLAN). Optional so callers that only care about
  // the recurrence pattern need not supply it.
  paused?: boolean | null;
};
type CheckinLike = { date: string; status: "planned" | "completed" | "skipped" };

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
  // A skipped day is explicitly not-doing-it, which is NOT the same as missing
  // it: it comes off the target rather than sitting in toPlan nagging forever.
  const skipped = states.filter((s) => s === "skipped").length;
  const target =
    task.recurrence_mode === "fixed_days" ? (task.scheduled_days ?? []).length : (task.target_per_week ?? 0);
  const effectiveTarget = Math.max(0, target - skipped);
  return { target: effectiveTarget, planned, completed, toPlan: Math.max(0, effectiveTarget - planned - completed) };
}

// Whether the task belongs in Today's schedule (BUILD_PLAN Phase 2):
// fixed_days → on its scheduled weekdays; count → until the week's target is met.
// True when this weekly task belongs to `date`. Date-generic on purpose — it is
// what lets any viewed day (not just today) render its weekly tasks inline.
export function appearsOn(task: WeeklyTaskLike, checkins: CheckinLike[], date: string): boolean {
  // Paused: claims no day at all, in either mode, on every date — past, present
  // and future. Checked FIRST so no later branch can hand it a day back. The
  // recurrence pattern itself is untouched, so unpausing resumes exactly as
  // before; this is a pause, not an archive. Distinct from a per-day skip.
  if (task.paused) return false;
  // Explicitly skipped for this day -> don't offer it again, whichever mode it
  // is. Checked FIRST: a fixed-days task returns early below, so a skip test
  // placed after that branch would silently never apply to fixed-days tasks.
  if (checkins.some((c) => c.date === date && c.status === "skipped")) return false;
  if (task.recurrence_mode === "fixed_days") {
    return (task.scheduled_days ?? []).includes(mondayIndex(date));
  }
  const week = new Set(weekDates(date));
  const completedThisWeek = checkins.filter((c) => c.status === "completed" && week.has(c.date)).length;
  return completedThisWeek < (task.target_per_week ?? 0);
}

// Pencil OFF, a cube click walks a two-stage cycle (BUILD_PLAN, 2026-09-04):
// empty → planned → completed → back to empty. One click never jumps straight
// to completed. "clear" removes the day's row: a count-mode day returns to
// empty, a fixed scheduled day falls back to its virtual planned baseline, and
// a skipped day is restored (unchanged behaviour).
export type CubeClickAction = "plan" | "complete" | "clear";

export function cubeClickAction(state: CubeState): CubeClickAction {
  if (state === "empty") return "plan";
  if (state === "planned") return "complete";
  return "clear";
}

// Does this task still need days planned this week? The "Unplanned Weekly
// Tasks" nudge, as one testable rule. Only count-mode tasks can be unplanned —
// a fixed-days pattern plans itself — and a paused task is never nudged.
export function needsPlanning(task: WeeklyTaskLike, checkins: CheckinLike[], today: string): boolean {
  if (task.paused) return false;
  if (task.recurrence_mode !== "count") return false;
  return progress(task, cubeStates(task, checkins, today)).toPlan > 0;
}
