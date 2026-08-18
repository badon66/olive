// Deno mirror of src/lib/reminders.ts — the SAME scheduling rules, kept in sync
// by hand (no cross-runtime shared package in v1, same as _shared/brief.ts).
// The client version is the one under unit test; this must match it.

export type RecurrenceType = "one_time" | "interval" | "daily" | "weekly" | "monthly";

export type ReminderLike = {
  recurrence_type: RecurrenceType;
  fire_at: string | null;
  interval_minutes: number | null;
  days_of_week: number[] | null;
  day_of_month: number | null;
  time_of_day: string | null;
  active: boolean;
  last_fired_at: string | null;
  created_at: string;
};

const ZONE = "America/Edmonton";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function offsetMinutesAt(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return (asIfUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000;
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(d);
}

function zonedToUtc(dateISO: string, hhmm: string): Date {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const [y, mo, d] = dateISO.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m, 0);
  let result = new Date(guess - offsetMinutesAt(new Date(guess)) * 60_000);
  const settled = offsetMinutesAt(result);
  const retry = new Date(guess - settled * 60_000);
  if (retry.getTime() !== result.getTime()) result = retry;
  return result;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function nextFireAt(r: ReminderLike, after: Date): Date | null {
  switch (r.recurrence_type) {
    case "one_time": {
      if (!r.fire_at) return null;
      const at = new Date(r.fire_at);
      return at.getTime() > after.getTime() ? at : null;
    }
    case "interval": {
      if (!r.interval_minutes || r.interval_minutes <= 0) return null;
      const base = new Date(r.created_at).getTime();
      const step = r.interval_minutes * 60_000;
      const k = Math.max(1, Math.floor((after.getTime() - base) / step) + 1);
      return new Date(base + k * step);
    }
    case "daily": {
      if (!r.time_of_day) return null;
      const todayShot = zonedToUtc(localDate(after), r.time_of_day);
      if (todayShot.getTime() > after.getTime()) return todayShot;
      return zonedToUtc(addDays(localDate(after), 1), r.time_of_day);
    }
    case "weekly": {
      if (!r.time_of_day || !r.days_of_week?.length) return null;
      for (let i = 0; i <= 7; i++) {
        const date = addDays(localDate(after), i);
        if (!r.days_of_week.includes(mondayIndex(date))) continue;
        const shot = zonedToUtc(date, r.time_of_day);
        if (shot.getTime() > after.getTime()) return shot;
      }
      return null;
    }
    case "monthly": {
      if (!r.time_of_day || !r.day_of_month) return null;
      const [y0, m0] = localDate(after).split("-").map(Number);
      for (let i = 0; i <= 13; i++) {
        const y = y0 + Math.floor((m0 - 1 + i) / 12);
        const m = ((m0 - 1 + i) % 12) + 1;
        if (r.day_of_month > daysInMonth(y, m)) continue;
        const date = `${y}-${String(m).padStart(2, "0")}-${String(r.day_of_month).padStart(2, "0")}`;
        const shot = zonedToUtc(date, r.time_of_day);
        if (shot.getTime() > after.getTime()) return shot;
      }
      return null;
    }
  }
}

export function isDue(r: ReminderLike, now: Date): boolean {
  if (!r.active) return false;
  const anchor = new Date(r.last_fired_at ?? r.created_at);
  const next = nextFireAt(r, anchor);
  return next !== null && next.getTime() <= now.getTime();
}

export function dueReminders<T extends ReminderLike>(reminders: T[], now: Date): T[] {
  return reminders.filter((r) => isDue(r, now));
}
