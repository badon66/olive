// Pure brief builder. Scoring constants deliberately mirror src/lib/ranking.ts —
// keep the two in sync (no cross-runtime shared package in v1).

// The day flips at 07:00 America/Edmonton, not midnight — must match
// src/lib/dates.ts so client and server agree on what "today" means.
export const DAY_START_HOUR = 7;

export function edmontonHour(now: Date = new Date()): number {
  return (
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Edmonton",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    ) % 24
  );
}

export function edmontonToday(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
  if (edmontonHour(now) >= DAY_START_HOUR) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type BriefTask = { id: string; due_date: string | null; priority_weight: number; created_at: string };

function score(t: BriefTask, today: string): number {
  if (!t.due_date) return t.priority_weight;
  const d = daysBetween(today, t.due_date);
  if (d < 0) return 100 + Math.min(-d, 30) + t.priority_weight;
  if (d === 0) return 80 + t.priority_weight;
  return Math.max(0, 50 - d * 5) + t.priority_weight;
}

export function buildBrief(tasks: BriefTask[], today: string) {
  const dated = (pred: (d: number) => boolean) =>
    tasks.filter((t) => t.due_date && pred(daysBetween(today, t.due_date!))).map((t) => t.id);
  return {
    overdue: dated((d) => d < 0),
    today: dated((d) => d === 0),
    upcoming: dated((d) => d > 0 && d <= 7),
    suggested_order: [...tasks]
      .sort((a, b) => score(b, today) - score(a, today) || a.created_at.localeCompare(b.created_at))
      .map((t) => t.id),
  };
}
