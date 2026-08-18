import { addDays, daysBetween, edmontonToday } from "./dates";

// Chronological within a day (the day flips at 5 AM — see dates.ts): morning
// through night. Night runs 11 PM–5 AM and belongs wholly to the day it started
// on. "anytime" is the catch-all.
export const SECTION_ORDER = ["morning", "midday", "afternoon", "evening", "night", "anytime"] as const;
export type TimeSection = (typeof SECTION_ORDER)[number];

// Resolved time-section clock boundaries (BUILD_PLAN, 2026-07-27). Only Morning is
// wake-relative; the rest are fixed. Night wraps midnight (11 PM–5 AM). "anytime"
// has no window. Used for the informational clock-range label on section headers.
const SECTION_CLOCK: Partial<Record<TimeSection, [string, string]>> = {
  midday: ["12:00", "16:00"],
  afternoon: ["16:00", "18:00"],
  evening: ["18:00", "23:00"],
  night: ["23:00", "05:00"],
};

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Human clock-range label for a section, e.g. "9:00 AM – 12:00 PM". Morning runs
// from wake_time (default 11:00) to noon; the rest are fixed. null for anytime.
export function sectionClockLabel(section: TimeSection, wakeTime = "11:00"): string | null {
  if (section === "morning") return `${to12h(wakeTime)} – 12:00 PM`;
  const r = SECTION_CLOCK[section];
  return r ? `${to12h(r[0])} – ${to12h(r[1])}` : null;
}

// Today's Schedule ribbon — a plain chronological sequence:
// Morning → Midday → Afternoon → Evening → Night, plus Anytime for the
// section-less leftovers.
//
// Night appears ONCE, at the end, where it belongs. The old build bookended the
// day with a leading "Night · earlier" slot; that only existed to paper over the
// 1:30 AM boundary cutting Night in half. With the boundary at 5:00 AM a night
// belongs wholly to the day it started on, so the leading slot is gone.
export type ScheduleSlot = {
  key: string;
  label: string;
  section: TimeSection;
  role: "section" | "anytime";
  droppable: boolean;
};

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { key: "morning", label: "Morning", section: "morning", role: "section", droppable: true },
  { key: "midday", label: "Midday", section: "midday", role: "section", droppable: true },
  { key: "afternoon", label: "Afternoon", section: "afternoon", role: "section", droppable: true },
  { key: "evening", label: "Evening", section: "evening", role: "section", droppable: true },
  { key: "night", label: "Night", section: "night", role: "section", droppable: true },
  { key: "anytime", label: "Anytime", section: "anytime", role: "anytime", droppable: true },
];

// Split the due-today set (overdue + today) into the ribbon's slots: each task
// simply lands in its own time_section, and a null section is "anytime".
//
// Night no longer needs due-date routing. Under the old 1:30 boundary a night
// task could belong to "yesterday" while the clock said today, so night had to
// be split into earlier/tonight; the 5:00 AM boundary keeps a night intact, so
// there is nothing left to disambiguate.
export function partitionSchedule<T extends { time_section: TimeSection | null }>(
  dueToday: T[],
): Record<string, T[]> {
  const out: Record<string, T[]> = {
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
    night: [],
    anytime: [],
  };
  for (const t of dueToday) out[t.time_section ?? "anytime"].push(t);
  return out;
}

// Upcoming day blocks: today plus `daysAhead` more, chronological. The panel
// shows 3 ahead collapsed and a full week (7) expanded.
export function upcomingDates(today: string, daysAhead: number): string[] {
  return Array.from({ length: daysAhead + 1 }, (_, i) => addDays(today, i));
}

// Timed bookings first (ascending), then flexible tasks by priority desc, created asc.
export function scheduleSort(
  a: { scheduled_time: string | null; priority_weight: number; created_at: string },
  b: { scheduled_time: string | null; priority_weight: number; created_at: string },
): number {
  if (a.scheduled_time !== null || b.scheduled_time !== null) {
    if (a.scheduled_time === null) return 1;
    if (b.scheduled_time === null) return -1;
    const byTime = a.scheduled_time.localeCompare(b.scheduled_time);
    if (byTime !== 0) return byTime;
  }
  return b.priority_weight - a.priority_weight || a.created_at.localeCompare(b.created_at);
}

type Sortable = {
  id: string;
  scheduled_time: string | null;
  priority_weight: number;
  created_at: string;
  sort_order?: number | null;
};

// Ordering inside a Today's Schedule section. Manually placed tasks (those with
// a sort_order) lead, in that order; anything never touched follows in the
// normal schedule sort — so the default stays bookings-first-by-time.
export function orderBySortOrder<T extends Sortable>(tasks: T[]): T[] {
  const placed = tasks.filter((t) => t.sort_order != null).sort((a, b) => a.sort_order! - b.sort_order!);
  const rest = tasks.filter((t) => t.sort_order == null).sort(scheduleSort);
  return [...placed, ...rest];
}

// The sections an arrow can traverse, in clock order. "anytime" is excluded: it
// is a holding pen, not a point on the timeline, so nudging out of Night must not
// dump a task there.
const TRAVERSABLE = SECTION_ORDER.filter((s) => s !== "anytime");

export type SectionMove = {
  section: TimeSection;
  // Where it lands within the destination: top when arriving from below, bottom
  // when arriving from above, so the motion reads as continuous.
  atEnd: boolean;
};

// Pressing up on the FIRST item of a section, or down on the LAST, carries the
// task across the boundary into the neighbouring section and updates its
// time_section — rather than doing nothing (BUILD_PLAN).
//
// `occupied` is the set of sections that currently hold at least one task.
// Completely empty sections in between are skipped in a single press, so one
// press always produces visible movement instead of silently landing somewhere
// the user can't see.
//
// Returns null at the very ends of the day (up from Morning, down from Night)
// and for "anytime", which has no neighbours on the clock.
export function nextSectionFor(
  from: TimeSection,
  dir: -1 | 1,
  occupied: ReadonlySet<TimeSection>,
): SectionMove | null {
  const i = TRAVERSABLE.indexOf(from as (typeof TRAVERSABLE)[number]);
  if (i === -1) return null; // "anytime" doesn't traverse
  for (let j = i + dir; j >= 0 && j < TRAVERSABLE.length; j += dir) {
    const candidate = TRAVERSABLE[j];
    if (occupied.has(candidate)) return { section: candidate, atEnd: dir === -1 };
  }
  // Nothing occupied that way — fall back to the immediate neighbour so the
  // press still does something, as long as one exists.
  const neighbour = TRAVERSABLE[i + dir];
  return neighbour ? { section: neighbour, atEnd: dir === -1 } : null;
}

// Move the task at `index` one step in `dir` within an already-ordered section,
// returning the sort_order values to persist for the WHOLE section. Renumbering
// every row (rather than swapping two) means a section with no prior ordering
// gets a complete, stable one on the very first nudge.
// Returns [] when the move would fall off either end.
export function reorderSection<T extends { id: string }>(
  ordered: T[],
  index: number,
  dir: -1 | 1,
): { id: string; sort_order: number }[] {
  const j = index + dir;
  if (index < 0 || index >= ordered.length || j < 0 || j >= ordered.length) return [];
  const next = [...ordered];
  [next[index], next[j]] = [next[j], next[index]];
  return next.map((t, i) => ({ id: t.id, sort_order: i }));
}

type TaskLike = {
  id: string;
  due_date: string | null;
  priority_weight: number;
  created_at: string;
  status: string;
  completed_at: string | null;
};

// Brief sections computed live from open tasks so mid-day changes are always current
export function computeSections<T extends TaskLike>(open: T[], today: string) {
  const dated = (pred: (d: number) => boolean) =>
    open.filter((t) => t.due_date && pred(daysBetween(today, t.due_date)));
  return {
    overdue: dated((d) => d < 0),
    today: dated((d) => d === 0),
    upcoming: dated((d) => d > 0 && d <= 7),
  };
}

export function doneTodayCount<T extends TaskLike>(tasks: T[], today: string): number {
  return tasks.filter(
    (t) => t.status === "completed" && t.completed_at !== null && edmontonToday(new Date(t.completed_at)) === today,
  ).length;
}
