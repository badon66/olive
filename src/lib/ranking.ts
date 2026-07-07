import { daysBetween } from "./dates";

// Score bands keep classes strictly separated regardless of priority (1-5):
// overdue 100+, due today 80+, future ≤ 55, undated ≤ 5.
export function scoreTask(
  t: { due_date: string | null; priority_weight: number },
  todayISO: string,
): number {
  if (!t.due_date) return t.priority_weight;
  const d = daysBetween(todayISO, t.due_date);
  if (d < 0) return 100 + Math.min(-d, 30) + t.priority_weight;
  if (d === 0) return 80 + t.priority_weight;
  return Math.max(0, 50 - d * 5) + t.priority_weight;
}

export function suggestedOrder<
  T extends { id: string; due_date: string | null; priority_weight: number; created_at: string },
>(tasks: T[], todayISO: string): string[] {
  return [...tasks]
    .sort(
      (a, b) =>
        scoreTask(b, todayISO) - scoreTask(a, todayISO) || a.created_at.localeCompare(b.created_at),
    )
    .map((t) => t.id);
}
