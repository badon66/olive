// All app date logic is Edmonton-local. Postgres `date` columns are plain
// YYYY-MM-DD strings; never construct `new Date("YYYY-MM-DD")` for display
// math (it parses as UTC midnight) — compare strings or use Date.UTC.

// The day flips at 07:00 America/Edmonton, NOT midnight — staying up late
// still counts as the previous day. Distinct from wake_time, which only
// shifts where the time-of-day sections sit.
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

// "Today" for every date column in the app (due dates, check-ins, briefs).
export function edmontonToday(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now); // YYYY-MM-DD
  return edmontonHour(now) < DAY_START_HOUR ? addDays(date, -1) : date;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function formatDue(dateISO: string, todayISO: string): string {
  const d = daysBetween(todayISO, dateISO);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0) return `${-d}d overdue`;
  const [y, m, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, day)),
  );
}
