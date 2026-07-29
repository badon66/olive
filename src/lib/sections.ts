import { addDays, daysBetween, edmontonToday } from "./dates";
import { scoreTask } from "./ranking";

// Chronological within a day (the day flips at 1:30 AM — see dates.ts): morning
// through night, with the small hours before 1:30 still belonging to the night
// that started the evening before. "anytime" is the catch-all.
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

// Today's Schedule ribbon. Night bookends the day: it leads as the tail of the
// nights already passed (context — not a drop target) and closes as this day's
// own upcoming night. "Anytime" is appended so those tasks aren't hidden. The
// whole ribbon advances at the 1:30 AM boundary because `today` (edmontonToday)
// is what feeds it — no per-slot clock logic needed.
export type ScheduleSlot = {
  key: string;
  label: string;
  section: TimeSection;
  role: "earlier-night" | "section" | "upcoming-night" | "anytime";
  droppable: boolean;
};

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { key: "night-earlier", label: "Night · earlier", section: "night", role: "earlier-night", droppable: false },
  { key: "morning", label: "Morning", section: "morning", role: "section", droppable: true },
  { key: "midday", label: "Midday", section: "midday", role: "section", droppable: true },
  { key: "afternoon", label: "Afternoon", section: "afternoon", role: "section", droppable: true },
  { key: "evening", label: "Evening", section: "evening", role: "section", droppable: true },
  { key: "night-ahead", label: "Night · tonight", section: "night", role: "upcoming-night", droppable: true },
  { key: "anytime", label: "Anytime", section: "anytime", role: "anytime", droppable: true },
];

// Split the due-today set (overdue + today) into the ribbon's slots. Night tasks
// route by due date: anything from before today is "earlier" (a night already
// passed), today's night tasks are "tonight". Every other task falls into its
// own time_section; a null section is "anytime". No task appears twice.
export function partitionSchedule<T extends { due_date: string | null; time_section: TimeSection | null }>(
  dueToday: T[],
  today: string,
): Record<string, T[]> {
  const out: Record<string, T[]> = {
    "night-earlier": [],
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
    "night-ahead": [],
    anytime: [],
  };
  for (const t of dueToday) {
    const section = t.time_section ?? "anytime";
    if (section === "night") {
      const past = t.due_date !== null && t.due_date < today;
      out[past ? "night-earlier" : "night-ahead"].push(t);
    } else {
      out[section].push(t);
    }
  }
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

// Effective priority order: stored order (manual wins over suggested) filtered to
// still-open tasks, with anything created after generation appended by score
export function effectiveOrder<T extends TaskLike>(baseOrder: string[], open: T[], today: string): T[] {
  const openById = new Map(open.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const id of baseOrder) {
    const t = openById.get(id);
    if (t && !seen.has(id)) {
      result.push(t);
      seen.add(id);
    }
  }
  const rest = open
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => scoreTask(b, today) - scoreTask(a, today) || a.created_at.localeCompare(b.created_at));
  return [...result, ...rest];
}

export function doneTodayCount<T extends TaskLike>(tasks: T[], today: string): number {
  return tasks.filter(
    (t) => t.status === "completed" && t.completed_at !== null && edmontonToday(new Date(t.completed_at)) === today,
  ).length;
}
