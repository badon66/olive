// All app date logic is Edmonton-local. Postgres `date` columns are plain
// YYYY-MM-DD strings; never construct `new Date("YYYY-MM-DD")` for display
// math (it parses as UTC midnight) — compare strings or use Date.UTC.

// TWO SEPARATE DAY BOUNDARIES. They are deliberately different and must NOT be
// collapsed into one — a previous build did exactly that (twice, in both
// directions) and both attempts were wrong. See CLAUDE.md.
//
//   VIEW (01:30) — "which day's page am I on".  Header, default schedule view,
//   day arrows, brief date, task lists. Before 1:30 you are still looking at
//   yesterday's page; at 1:30 sharp the default view moves to today.
//
//   ACTIVE (05:00) — "which day's Night is still running".  Night is 11 PM–5 AM,
//   so it stays attributed to the day it STARTED on until it is actually over at
//   5:00, regardless of the page having already flipped at 1:30.
//
// Worked example, the night of the 12th→13th:
//   01:00 — view = 12th, active = 12th   (agree)
//   02:00 — view = 13th, active = 12th   (DISAGREE — this is correct)
//   05:00 — view = 13th, active = 13th   (agree again)
//
// Both are distinct from wake_time, which only shifts where the daytime sections
// sit within a day once it is underway.
export const VIEW_DAY_START_MINUTES = 90; // 01:30 local — page flip
export const ACTIVE_DAY_START_MINUTES = 300; // 05:00 local — end of Night

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

// Minutes since local midnight in Edmonton.
export function edmontonMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

// VIEW day — "which day's page am I on". Drives every date column in the app
// (due dates, check-ins, briefs) and the schedule header/arrows. Before 1:30 AM
// it is still the previous calendar day.
export function edmontonToday(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now); // YYYY-MM-DD
  return edmontonMinutes(now) < VIEW_DAY_START_MINUTES ? addDays(date, -1) : date;
}

// ACTIVE day — "which day's Night is still running". Only for the right-now
// questions: Active Tasks and the current-section highlight. Between 1:30 and
// 5:00 AM this intentionally trails edmontonToday() by one day.
export function edmontonActiveDay(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
  return edmontonMinutes(now) < ACTIVE_DAY_START_MINUTES ? addDays(date, -1) : date;
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

// Seconds remaining until the next 1:30 AM Edmonton page flip — drives the live
// top-corner countdown. This tracks the VIEW boundary, since that is the one the
// user sees happen (the schedule page turns over).
// DST-simplified (ignores the rare same-day shift).
export function secondsUntilRollover(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const sec = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  const rollover = VIEW_DAY_START_MINUTES * 60; // 01:30 in seconds since local midnight
  return sec < rollover ? rollover - sec : 86_400 + rollover - sec;
}

export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
}

// Full, human date label — e.g. "Wednesday, August 12th". Used for the dynamic
// schedule header when a day other than today is being viewed.
export function fullDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(dt);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(dt);
  return `${weekday}, ${month} ${d}${ordinalSuffix(d)}`;
}

function longMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// Weekly Tasks header, e.g. "Week of July 21–27" (same month) or
// "Week of July 28 – August 3" (crossing a month boundary).
export function weekRangeLabel(mondayISO: string, sundayISO: string): string {
  const monDay = Number(mondayISO.split("-")[2]);
  const sunDay = Number(sundayISO.split("-")[2]);
  const monMonth = longMonth(mondayISO);
  const sunMonth = longMonth(sundayISO);
  return monMonth === sunMonth
    ? `Week of ${monMonth} ${monDay}–${sunDay}`
    : `Week of ${monMonth} ${monDay} – ${sunMonth} ${sunDay}`;
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
