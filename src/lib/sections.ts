import { addDays, daysBetween, edmontonToday } from "./dates";
import { scoreTask } from "./ranking";

export const SECTION_ORDER = ["morning", "midday", "afternoon", "evening", "anytime"] as const;
export type TimeSection = (typeof SECTION_ORDER)[number];

// Next 7 calendar days (tomorrow…+7) rendered Monday-first — any 7 consecutive
// days contain each weekday exactly once, so this ordering is total.
export function dayBlockDates(today: string): string[] {
  const mondayFirst = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  };
  return Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).sort(
    (a, b) => mondayFirst(a) - mondayFirst(b),
  );
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
