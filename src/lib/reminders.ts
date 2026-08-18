import { addDays } from "./dates";
import { mondayIndex } from "./weekly";

// Reminder scheduling. Every recurrence shape resolves to the same question:
// "what is the next instant this should fire, strictly after X?" — so firing,
// catch-up and the next-due display all share one code path.
//
// daily/weekly/monthly store a WALL-CLOCK time_of_day, so 9:00 AM stays 9:00 AM
// across a DST change. That means converting Edmonton local time → UTC instant,
// which is what zonedToUtc below does.

export const RECURRENCE_TYPES = ["one_time", "interval", "daily", "weekly", "monthly"] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  one_time: "One time",
  interval: "Every X minutes",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

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

// Minutes that Edmonton is offset from UTC at a given instant (negative: behind).
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

// Edmonton calendar date (YYYY-MM-DD) for an instant. Plain calendar date — the
// 5 AM "day rollover" used elsewhere is a scheduling concept, not a clock one.
function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(d);
}

// A local Edmonton wall-clock date+time as a real UTC instant. Resolved twice so
// a DST transition between the guess and the answer still lands correctly.
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

// The next instant this reminder fires, strictly after `after`. null = never
// again (a one-time reminder already past, or an incoherent row).
export function nextFireAt(r: ReminderLike, after: Date): Date | null {
  switch (r.recurrence_type) {
    case "one_time": {
      if (!r.fire_at) return null;
      const at = new Date(r.fire_at);
      return at.getTime() > after.getTime() ? at : null;
    }

    case "interval": {
      if (!r.interval_minutes || r.interval_minutes <= 0) return null;
      // Occurrences are anchored to creation (created_at + k·interval) so the
      // cadence never drifts, however late a tick runs.
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
      // Look across today plus a full week so every selected day is reachable.
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
      // Skip months that are too short for the chosen day (e.g. the 31st in
      // February) rather than silently sliding into the next month.
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

// Whether a reminder is due to fire at `now`, given what it has already fired.
// Anchoring on last_fired_at (falling back to creation) makes catch-up
// idempotent: a missed window fires once when the app/cron comes back, not once
// per skipped slot.
export function isDue(r: ReminderLike, now: Date): boolean {
  if (!r.active) return false;
  const anchor = new Date(r.last_fired_at ?? r.created_at);
  const next = nextFireAt(r, anchor);
  return next !== null && next.getTime() <= now.getTime();
}

export function dueReminders<T extends ReminderLike>(reminders: T[], now: Date): T[] {
  return reminders.filter((r) => isDue(r, now));
}

// Human summary of the schedule, for list rows.
export function describeRecurrence(r: ReminderLike): string {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const at = r.time_of_day ? to12h(r.time_of_day) : "";
  switch (r.recurrence_type) {
    case "one_time":
      return r.fire_at
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: ZONE,
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(r.fire_at))
        : "One time";
    case "interval": {
      const m = r.interval_minutes ?? 0;
      if (m % 60 === 0 && m >= 60) return `Every ${m / 60} hour${m === 60 ? "" : "s"}`;
      return `Every ${m} min`;
    }
    case "daily":
      return `Daily at ${at}`;
    case "weekly": {
      const days = (r.days_of_week ?? []).map((d) => DAYS[d]).join(", ");
      return `${days} at ${at}`;
    }
    case "monthly":
      return `Day ${r.day_of_month} at ${at}`;
  }
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
