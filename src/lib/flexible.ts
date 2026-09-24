import { addDays, daysBetween, edmontonToday } from "./dates";
import type { TimeSection } from "./sections";

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
  // When the task as a whole was finished — places a finished window on the
  // day it was actually done (see showsOnDate).
  completed_at?: string | null;
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

// A day's RECORD, finished work included — what history-showing views like
// Upcoming Days render (struck through). occursOn deliberately excludes
// finished work, because it answers "what is still to do on this day"; using it
// for a record made every ticked-off task vanish from its day instead of
// showing as done.
//   fixed   its own day
//   window  the day it was finished, if inside the range — not the days before
//           (it wasn't done yet) and not after (it's gone). Finished outside the
//           range, it is recorded on the range's last day.
//   pick    every chosen day, each shown as done
export function showsOnDate(t: ScheduledTask, date: string): boolean {
  if (t.status !== "completed") return occursOn(t, date);
  const mode = schedulingMode(t);
  if (mode === "pick") return (t.candidate_dates ?? []).includes(date);
  if (mode === "window") {
    if (!t.window_start || !t.window_end) return false;
    const finished = t.completed_at ? edmontonToday(new Date(t.completed_at)) : null;
    const inRange = finished !== null && t.window_start <= finished && finished <= t.window_end;
    return date === (inRange ? finished : t.window_end);
  }
  return t.due_date === date;
}

// ── What the date chip says ─────────────────────────────────────────────────
// A multi-day task shows its RANGE, never a single date. One date on a task
// that belongs to four days reads as "that day" — and back when a scheduler
// kept changing which single day it was, that one date visibly flickered. The
// range is fixed by the task itself, so it cannot change from render to render
// or depend on which day you are looking from.

// Month abbreviation from a YYYY-MM-DD string. Built from Date.UTC and
// formatted in UTC so the calendar date can never slide a day through a
// timezone conversion (the classic off-by-one).
function shortMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
const dayNum = (iso: string) => Number(iso.split("-")[2]);
const monthKey = (iso: string) => iso.slice(0, 7);

// "Sep 24", "Sep 24–28", "Sep 29 – Oct 2" — same shape as weekRangeLabel.
export function formatRange(start: string, end: string): string {
  if (start === end) return `${shortMonth(start)} ${dayNum(start)}`;
  return monthKey(start) === monthKey(end)
    ? `${shortMonth(start)} ${dayNum(start)}–${dayNum(end)}`
    : `${shortMonth(start)} ${dayNum(start)} – ${shortMonth(end)} ${dayNum(end)}`;
}

// "Sep 24, 26, 29" — the month is named once, and again only where it changes.
// Past four days the list stops being glanceable, so it collapses to the span.
const MAX_LISTED_DAYS = 4;
export function formatDays(dates: string[]): string {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) return "";
  if (days.length > MAX_LISTED_DAYS) {
    return `${formatRange(days[0], days[days.length - 1])} · ${days.length} days`;
  }
  return days
    .map((d, i) => (i === 0 || monthKey(d) !== monthKey(days[i - 1]) ? `${shortMonth(d)} ${dayNum(d)}` : String(dayNum(d))))
    .join(", ");
}

export function whenLabel(
  t: ScheduledTask,
  today: string,
): { text: string; overdue: boolean } | null {
  const mode = schedulingMode(t);
  const overdue = isFlexibleOverdue(t, today);
  if (mode === "fixed") {
    if (!t.due_date) return null;
    const d = daysBetween(today, t.due_date);
    const text = d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 0 ? `${-d}d overdue` : formatRange(t.due_date, t.due_date);
    return { text, overdue: d < 0 };
  }
  const days = occurrenceDates(t);
  if (days.length === 0) return null;
  const text = mode === "window" ? formatRange(days[0], days[days.length - 1]) : formatDays(days);
  return { text: overdue ? `${text} · overdue` : text, overdue };
}

// ── Moving a task, whatever its shape ───────────────────────────────────────
// Every way of moving a task — dragging it, "Skip for the day", "Reschedule",
// telling the assistant "move it to Friday" — used to rewrite due_date alone.
// For a window or pick task that moved NOTHING (occursOn reads the range, not
// due_date) but corrupted the deadline: the date chip jumped from "Sep 28" to
// "Today", and the next day the task was flagged overdue and listed in Carryover
// while its window was still running. These patches are the only sanctioned way
// to move a task, and each one respects the task's shape.

export type SchedulePatch = {
  due_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  candidate_dates?: string[] | null;
  completed_dates?: string[] | null;
  time_section?: TimeSection | null;
  status?: "open" | "completed";
  completed_at?: string | null;
};

// Put a task on exactly ONE day. Choosing a specific date for a multi-day task
// ("Reschedule", dropping it on a day block, "move it to Friday") means "it's
// happening on that day", so it becomes a plain single-day task there.
export function onDayPatch(date: string | null): SchedulePatch {
  return { due_date: date, window_start: null, window_end: null, candidate_dates: null, completed_dates: null };
}

// Dropping a task into a part of a day. A multi-day task dropped on a day it
// ALREADY covers is only changing its part of the day, so its days — and its
// deadline — are left exactly as they are. Dropped anywhere else, it lands on
// that one day.
export function dropPatch(t: ScheduledTask, date: string, section: TimeSection | null): SchedulePatch {
  if (isFlexible(t) && occursOn(t, date)) return { time_section: section };
  return { ...onDayPatch(date), time_section: section };
}

// "Skip for the day" on `day` — the day the task was shown on, which is not
// necessarily today (Today's Schedule can be stepped to any day).
//   fixed   moves to the next day
//   window  drops the skipped day, keeping the rest of the range; skipping its
//           last day carries it to the next day
//   pick    drops just the skipped day; if nothing is left from the next day
//           on, the next day is added so the task does not silently vanish
export function skipDayPatch(t: ScheduledTask, day: string): SchedulePatch {
  const next = addDays(day, 1);
  const mode = schedulingMode(t);
  if (mode === "window") {
    if (t.window_end && next <= t.window_end) {
      return t.window_start && next > t.window_start ? { window_start: next } : {};
    }
    return { window_start: next, window_end: next, due_date: next };
  }
  if (mode === "pick") {
    const days = (t.candidate_dates ?? []).filter((d) => d !== day);
    if (!days.some((d) => d >= next)) days.push(next);
    days.sort();
    return {
      candidate_dates: days,
      completed_dates: (t.completed_dates ?? []).filter((d) => d !== day && days.includes(d)),
      due_date: days[days.length - 1],
    };
  }
  return { due_date: next };
}

// True only when skipping would change nothing — a fixed task already sitting
// on the next day. A multi-day task always has the skipped day itself to drop.
export function skipIsPointless(t: ScheduledTask, day: string): boolean {
  return !isFlexible(t) && t.due_date === addDays(day, 1);
}

// Ticking ONE day of a pick task. The task closes when nothing is left to do:
// no chosen day from `today` onward is still unticked. A MISSED earlier day
// therefore can't keep it open for ever — previously it could, and an overdue
// pick task came back unticked every single day no matter how often it was
// ticked. Ticking a pick task on a day it was never set for (it is showing
// because it's overdue) finishes it outright.
export function completeDayPatch(t: ScheduledTask, date: string, today: string, nowIso: string): SchedulePatch {
  const chosen = t.candidate_dates ?? [];
  const isChosenDay = chosen.includes(date);
  const days = [...new Set([...(t.completed_dates ?? []), ...(isChosenDay ? [date] : [])])].sort();
  const remaining = chosen.filter((d) => d >= today && !days.includes(d));
  const closes = !isChosenDay || remaining.length === 0;
  return closes ? { completed_dates: days, status: "completed", completed_at: nowIso } : { completed_dates: days };
}

export function uncompleteDayPatch(t: ScheduledTask, date: string): SchedulePatch {
  return { completed_dates: (t.completed_dates ?? []).filter((d) => d !== date), status: "open", completed_at: null };
}

// Reopening a task means it isn't done — for a pick task that includes its days,
// which otherwise stayed ticked while the task itself read as open.
export function reopenPatch(t: ScheduledTask): SchedulePatch {
  const base: SchedulePatch = { status: "open", completed_at: null };
  return schedulingMode(t) === "pick" ? { ...base, completed_dates: [] } : base;
}

// Editing a task's days. Ticks for days that are no longer chosen are dropped,
// and a pick task's open/closed state follows what is actually left: removing
// its only unticked day finishes it, adding a day to a finished one reopens it.
export function reconcileOnEdit(
  prev: ScheduledTask | undefined,
  next: Shape,
  nowIso: string,
): SchedulePatch {
  if (schedulingMode(next) !== "pick") return { completed_dates: null };
  const chosen = next.candidate_dates ?? [];
  const kept = (prev?.completed_dates ?? []).filter((d) => chosen.includes(d)).sort();
  if (!prev) return { completed_dates: kept };
  const allDone = chosen.length > 0 && chosen.every((d) => kept.includes(d));
  if (prev.status === "completed" && !allDone) return { completed_dates: kept, status: "open", completed_at: null };
  if (prev.status !== "completed" && allDone) return { completed_dates: kept, status: "completed", completed_at: nowIso };
  return { completed_dates: kept };
}

// Dropping a task onto a day box (Upcoming Days). A multi-day task dropped on a
// day it ALREADY covers is left exactly as it is — a sloppy drag that lands back
// in its own box must not quietly turn a window into a one-day task. Returns null
// when there is nothing to change.
export function dayDropPatch(t: ScheduledTask, date: string): SchedulePatch | null {
  if (isFlexible(t) && occursOn(t, date)) return null;
  return onDayPatch(date);
}

// Lets the rules above read loosely-typed task rows (insight, job stats) where
// the flexible columns may be absent.
export function asScheduled(t: {
  id?: string;
  status?: string;
  due_date: string | null;
  window_start?: string | null;
  window_end?: string | null;
  candidate_dates?: string[] | null;
  completed_dates?: string[] | null;
}): ScheduledTask {
  return {
    id: t.id ?? "",
    status: t.status ?? "open",
    due_date: t.due_date,
    window_start: t.window_start ?? null,
    window_end: t.window_end ?? null,
    candidate_dates: t.candidate_dates ?? null,
    completed_dates: t.completed_dates ?? null,
  };
}
