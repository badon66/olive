import { addDays } from "./dates";

export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

// Consecutive checked days ending today (or yesterday — an unchecked today
// never breaks a streak in progress).
export function dailyStreak(checkedDates: Set<string>, today: string): number {
  let cursor = checkedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (checkedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Consecutive Monday-weeks with ≥1 check-in ending this week (or last week —
// same grace rule as daily).
export function weeklyStreak(checkedDates: Iterable<string>, today: string): number {
  const weeks = new Set([...checkedDates].map(mondayOf));
  const thisWeek = mondayOf(today);
  let cursor = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export function last7Days(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}
