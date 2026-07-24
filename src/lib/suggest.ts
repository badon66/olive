import { edmontonHour } from "./dates";
import { SECTION_ORDER, type TimeSection } from "./sections";

// Suggested-schedule pull-forward (BUILD_PLAN Phase 1): overdue + due-today are
// the must-do baseline. Where a time_section has room left (and isn't a blocked
// window), pull the highest-priority UNSCHEDULED tasks forward to fill it,
// using duration_minutes as a rough guide. Purely a suggestion — non-destructive.

export type BlockedWindow = { start: string; end: string; label: string };

export type SuggestTask = {
  id: string;
  due_date: string | null;
  time_section: TimeSection | null;
  priority_weight: number;
  duration_minutes: number | null;
  created_at: string;
};

const DEFAULT_DUR = 30; // a task with no duration counts as this much room
const SECTION_CAP = 120; // soft per-section target in minutes

// Fixed clock ranges (hours) covering the whole 7 AM → 7 AM day. Night wraps
// midnight, so it carries two ranges. Wake-time-relative boundaries remain a
// separate deferred feature.
const SECTION_RANGES: Record<Exclude<TimeSection, "anytime">, [number, number][]> = {
  morning: [[7, 11]],
  midday: [[11, 14]],
  afternoon: [[14, 17]],
  evening: [[17, 23]],
  night: [
    [23, 24],
    [0, 7],
  ],
};

function toHours(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

// Which part of the day it is right now in Edmonton — drives the Active Tasks
// panel (a live snapshot of only the current section).
export function currentSection(now: Date = new Date()): TimeSection {
  const hour = edmontonHour(now);
  for (const [section, ranges] of Object.entries(SECTION_RANGES) as [
    Exclude<TimeSection, "anytime">,
    [number, number][],
  ][]) {
    if (ranges.some(([s, e]) => hour >= s && hour < e)) return section;
  }
  return "anytime";
}

export function sectionBlocked(section: TimeSection, windows: BlockedWindow[]): boolean {
  if (section === "anytime") return false; // no clock range → never blocked
  return SECTION_RANGES[section].some(([s, e]) =>
    windows.some((w) => toHours(w.start) < e && toHours(w.end) > s),
  );
}

// Returns, per section, the ids of unscheduled tasks suggested to fill it.
// Each candidate is placed in at most one section; blocked sections get none.
export function pullForward(
  open: SuggestTask[],
  today: string,
  windows: BlockedWindow[],
): Record<TimeSection, string[]> {
  const dur = (t: SuggestTask) => t.duration_minutes ?? DEFAULT_DUR;
  const result: Record<TimeSection, string[]> = {
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
    night: [],
    anytime: [],
  };

  // Baseline load per section from the must-do items (overdue + due today)
  const load: Record<TimeSection, number> = {
    morning: 0,
    midday: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
    anytime: 0,
  };
  for (const t of open) {
    if (t.due_date !== null && t.due_date <= today) {
      load[t.time_section ?? "anytime"] += dur(t);
    }
  }

  const candidates = open
    .filter((t) => t.due_date === null)
    .sort((a, b) => b.priority_weight - a.priority_weight || a.created_at.localeCompare(b.created_at));

  let ci = 0;
  for (const section of SECTION_ORDER) {
    if (sectionBlocked(section, windows)) continue;
    let room = SECTION_CAP - load[section];
    while (room > 0 && ci < candidates.length) {
      const t = candidates[ci++];
      result[section].push(t.id);
      room -= dur(t);
    }
  }
  return result;
}
