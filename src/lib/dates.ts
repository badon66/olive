// All app date logic is Edmonton-local. Postgres `date` columns are plain
// YYYY-MM-DD strings; never construct `new Date("YYYY-MM-DD")` for display
// math (it parses as UTC midnight) — compare strings or use Date.UTC.

export function edmontonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now); // en-CA → YYYY-MM-DD
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
