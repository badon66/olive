import { addDays, daysBetween } from "./dates";

// How a task is scheduled (BUILD_PLAN, reworked 2026-09-24 at Keenan's
// direction). Three shapes, inferred from which columns are set:
//
//   fixed   due_date            one day.
//   window  window_start..end   occurs on EVERY day in the range. One
//                               completion finishes it and it disappears from
//                               the remaining days.
//   pick    candidate_dates[]   occurs on EVERY chosen day, and each day is
//                               completed independently — finishing Monday
//                               leaves Wednesday still showing.
//
// SUPERSEDES the original "load-balanced placement" model (BUILD_PLAN lines
// 84-85), where the system chose ONE day inside the range and moved the task
// between days as they filled up. That is why a task given a Sept 23-25 window
// appeared on a single day and drifted: it was working as originally specified.
// Nothing chooses a day any more — the task simply belongs to all of them — so
// the whole placement scheduler (loadByDay/bestPlacement/replacementFor/
// planPlacements) and the `placed_date` column it maintained are gone.
//
// `due_date` survives as the DEADLINE: sorting, carryover and overdue all read
// it. It never decides which days a task shows on — occursOn() does.

export type SchedulingMode = "fixed" | "window" | "pick";

export type ScheduledTask = {
  id: string;
  status: string;
  due_date: string | null;
  window_start: string | null;
  window_end: string | null;
  candidate_dates: string[] | null;
  // Per-day completion, used by pick mode only. A date listed here is done for
  // that day; the task's other chosen days are unaffected.
  completed_dates?: string[] | null;
};

type Shape = Pick<ScheduledTask, "window_start" | "window_end" | "candidate_dates">;

export function schedulingMode(t: Shape): SchedulingMode {
  if (t.candidate_dates && t.candidate_dates.length > 0) return "pick";
  if (t.window_start) return "window";
  return "fixed";
}

export function isFlexible(t: Shape): boolean {
  return schedulingMode(t) !== "fixed";
}

// Every day this task shows on, chronological and de-duplicated.
export function occurrenceDates(t: Shape & { due_date?: string | null }): string[] {
  const mode = schedulingMode(t);
  if (mode === "pick") return [...new Set(t.candidate_dates!)].sort();
  if (mode === "window") {
    if (!t.window_start || !t.window_end) return [];
    const span = daysBetween(t.window_start, t.window_end);
    // A backwards range is incoherent — yield nothing rather than looping.
    if (span < 0) return [];
    return Array.from({ length: span + 1 }, (_, i) => addDays(t.window_start!, i));
  }
  return t.due_date ? [t.due_date] : [];
}

// THE rule for "does this task belong to this day". Every day-grouped panel
// goes through it, so a window task cannot appear on one day in one panel and a
// different day in another.
export function occursOn(t: ScheduledTask, date: string): boolean {
  if (t.status === "completed") return false;
  const mode = schedulingMode(t);
  if (mode === "pick") return (t.candidate_dates ?? []).includes(date);
  if (mode === "window") {
    if (!t.window_start || !t.window_end) return false;
    return t.window_start <= date && date <= t.window_end;
  }
  return t.due_date === date;
}

// Done FOR THIS DAY. Only pick mode distinguishes days; for the other two a
// completion is global.
export function dayIsDone(t: ScheduledTask, date: string): boolean {
  if (t.status === "completed") return true;
  if (schedulingMode(t) !== "pick") return false;
  return (t.completed_dates ?? []).includes(date);
}

// A pick task is finished outright only when every day it was set for is done.
export function allDaysDone(t: ScheduledTask): boolean {
  if (schedulingMode(t) !== "pick") return t.status === "completed";
  const done = new Set(t.completed_dates ?? []);
  const days = t.candidate_dates ?? [];
  return days.length > 0 && days.every((d) => done.has(d));
}

// The due_date value a task of this shape should store — its last possible day.
export function deadlineFor(t: Shape & { due_date?: string | null }): string | null {
  const days = occurrenceDates(t);
  return days.length > 0 ? days[days.length - 1] : (t.due_date ?? null);
}

// Overdue once every day it could have happened on is spent. A flexible task
// sitting on a past day is NOT overdue while a later day of its own set
// remains — that is the whole point of the shape.
export function isFlexibleOverdue(t: ScheduledTask, today: string): boolean {
  if (t.status !== "open") return false;
  if (!isFlexible(t)) return t.due_date !== null && t.due_date < today;
  return !occurrenceDates(t).some((d) => d >= today);
}

// Every open task belonging to `date`, whatever its shape. Returns each task at
// most once, which matters because a flexible task's deadline sits INSIDE its
// own range — matching on due_date as well would double it up.
export function tasksOnDate<T extends ScheduledTask>(tasks: T[], date: string): T[] {
  return tasks.filter((t) => occursOn(t, date));
}
