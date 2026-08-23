import { addDays, daysBetween } from "./dates";

// Flexible-window tasks (BUILD_PLAN): a task that doesn't belong to one fixed
// day, but to a SET of acceptable days. The scheduler puts it on whichever
// option is least busy, moves it if that day fills up and the task still isn't
// done, and only calls it overdue once every option is in the past.
//
// Two mutually exclusive ways to express the options — enforced by a check
// constraint on the table, mirrored by candidatesFor():
//   • a continuous range  window_start .. window_end
//   • hand-picked days    candidate_dates[]

export type FlexibleTask = {
  id: string;
  status: string;
  due_date: string | null;
  placed_date: string | null;
  window_start: string | null;
  window_end: string | null;
  candidate_dates: string[] | null;
};

export function isFlexible(t: Pick<FlexibleTask, "window_start" | "candidate_dates">): boolean {
  return t.window_start !== null || (t.candidate_dates !== null && t.candidate_dates.length > 0);
}

// Every day this task is allowed to land on, chronological and de-duplicated.
// A range expands inclusively; hand-picked days are taken as given.
export function candidatesFor(t: FlexibleTask): string[] {
  if (t.candidate_dates && t.candidate_dates.length > 0) {
    return [...new Set(t.candidate_dates)].sort();
  }
  if (t.window_start && t.window_end) {
    const span = daysBetween(t.window_start, t.window_end);
    if (span < 0) return [];
    return Array.from({ length: span + 1 }, (_, i) => addDays(t.window_start!, i));
  }
  return [];
}

// Options still open: today or later. Yesterday is spent.
export function remainingCandidates(t: FlexibleTask, today: string): string[] {
  return candidatesFor(t).filter((d) => d >= today);
}

// A flexible task is overdue ONLY when every option is exhausted — not merely
// because the day it happens to be sitting on has passed. This is the whole
// point of the feature: it has somewhere else to go.
export function isFlexibleOverdue(t: FlexibleTask, today: string): boolean {
  if (t.status !== "open") return false;
  if (!isFlexible(t)) return t.due_date !== null && t.due_date < today;
  return remainingCandidates(t, today).length === 0;
}

// How loaded a day is. Duration is the real signal — six 5-minute errands are
// not the same weight as one 3-hour job — with a floor so untimed tasks still
// count for something rather than looking free.
const ASSUMED_MINUTES = 30;

export type DayLoad = { date: string; minutes: number; count: number };

export function loadByDay(
  tasks: { due_date: string | null; status: string; duration_minutes: number | null }[],
  dates: string[],
): Map<string, DayLoad> {
  const out = new Map<string, DayLoad>(dates.map((d) => [d, { date: d, minutes: 0, count: 0 }]));
  for (const t of tasks) {
    if (t.status !== "open" || t.due_date === null) continue;
    const slot = out.get(t.due_date);
    if (!slot) continue;
    slot.minutes += t.duration_minutes ?? ASSUMED_MINUTES;
    slot.count += 1;
  }
  return out;
}

// Pick the emptiest remaining option. Ties break toward the EARLIER day, so a
// flexible task drifts forward only when it genuinely has to.
export function bestPlacement(
  t: FlexibleTask,
  today: string,
  load: Map<string, DayLoad>,
): string | null {
  const options = remainingCandidates(t, today);
  if (options.length === 0) return null;
  let best = options[0];
  let bestMinutes = load.get(best)?.minutes ?? 0;
  for (const d of options.slice(1)) {
    const m = load.get(d)?.minutes ?? 0;
    if (m < bestMinutes) {
      best = d;
      bestMinutes = m;
    }
  }
  return best;
}

// Should this task move? Only for OPEN tasks, and only when the move is worth
// making — a completed task never moves, and neither does one whose current day
// is already among the best options. `slackMinutes` stops it thrashing between
// two nearly-equal days.
const SLACK_MINUTES = 45;

export function replacementFor(
  t: FlexibleTask,
  today: string,
  load: Map<string, DayLoad>,
  slackMinutes = SLACK_MINUTES,
): string | null {
  if (t.status !== "open" || !isFlexible(t)) return null;
  const target = bestPlacement(t, today, load);
  if (target === null) return null; // exhausted — it's overdue, not movable
  const current = t.placed_date ?? t.due_date;
  if (current === null) return target; // never placed
  if (current === target) return null;
  // Staying put is fine unless the current day is meaningfully busier, or the
  // current day has already passed (then any remaining option beats it).
  if (current < today) return target;
  const currentLoad = load.get(current)?.minutes ?? 0;
  const targetLoad = load.get(target)?.minutes ?? 0;
  return currentLoad - targetLoad > slackMinutes ? target : null;
}
