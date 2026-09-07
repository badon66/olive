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

// ── Firing instances ────────────────────────────────────────────────────────
// BUILD_PLAN separates the recurring DEFINITION (`reminders`) from each
// individual FIRING (`reminder_fires`). A fire row is the durable record that
// one occurrence came due, which is what lets an alert survive the app being
// closed and what the repeat-until-dismissed cadence counts against.

// Bounded so a pathological row can never spin. Date-based recurrences step by
// days/weeks/months, so 400 covers well over a year of outage; interval takes
// the arithmetic fast path below and never iterates at all.
const MAX_CATCHUP_STEPS = 400;

// WHICH occurrence is currently due, or null — the instant itself, so it can key
// a fire row idempotently by (reminder_id, occurrence_at).
//
// Returns the MOST RECENT occurrence that is already due, not the oldest
// outstanding one. Both raise a single alert, but landing on the newest also
// advances the schedule fully: returning the oldest left the anchor one slot
// behind, so a reminder that missed a day of slots crawled forward one per tick
// (caught live — a 30-minute reminder idle for 90 minutes came back at the
// first missed slot rather than the current one).
export function dueOccurrence(r: ReminderLike, now: Date): Date | null {
  if (!r.active) return null;
  const anchor = new Date(r.last_fired_at ?? r.created_at);
  const first = nextFireAt(r, anchor);
  if (first === null || first.getTime() > now.getTime()) return null;

  // Interval slots are pure arithmetic off created_at, so jump straight to the
  // latest rather than stepping — a 1-minute reminder after a week of downtime
  // costs one calculation instead of ten thousand.
  if (r.recurrence_type === "interval" && r.interval_minutes && r.interval_minutes > 0) {
    const base = new Date(r.created_at).getTime();
    const step = r.interval_minutes * 60_000;
    const latest = new Date(base + Math.floor((now.getTime() - base) / step) * step);
    return latest.getTime() > first.getTime() ? latest : first;
  }

  let due = first;
  for (let i = 0; i < MAX_CATCHUP_STEPS; i++) {
    const next = nextFireAt(r, due);
    if (next === null || next.getTime() > now.getTime()) break;
    due = next;
  }
  return due;
}

export type FireLike = {
  fired_at: string;
  dismissed: boolean;
  repeat_count: number;
};

export type RepeatPolicy = {
  max_repeats: number;
  repeat_interval_seconds: number;
};

// Attempt N lands at fired_at + N·interval, so attempt 0 (the first alert) is
// due immediately rather than one interval late.
export function attemptDueAt(f: FireLike, p: RepeatPolicy): Date {
  return new Date(new Date(f.fired_at).getTime() + f.repeat_count * p.repeat_interval_seconds * 1000);
}

// Spent its attempts. BUILD_PLAN: it then "stops and goes quiet until the next
// scheduled occurrence" — it must NOT linger as an unresolved notification, so
// an exhausted fire stops being alertable while staying on record undismissed.
export function isExhausted(f: FireLike, p: RepeatPolicy): boolean {
  return f.repeat_count >= p.max_repeats;
}

export function needsAttempt(f: FireLike, p: RepeatPolicy, now: Date): boolean {
  if (f.dismissed || isExhausted(f, p)) return false;
  return attemptDueAt(f, p).getTime() <= now.getTime();
}

// ── Countdown ring inputs ───────────────────────────────────────────────────

export function secondsUntil(next: Date | null, now: Date): number | null {
  if (next === null) return null;
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
}

export function countdownLabel(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${pad(seconds % 60)}s`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

// The occurrence immediately BEFORE `before`. Computed per recurrence shape
// rather than by subtracting a nominal span, so a DST day is exactly 23 or 25
// hours and an uneven weekly pattern (Mon/Wed/Fri) reports its real gaps.
function previousFireAt(r: ReminderLike, before: Date): Date | null {
  switch (r.recurrence_type) {
    case "one_time":
      return new Date(r.created_at);

    case "interval": {
      if (!r.interval_minutes || r.interval_minutes <= 0) return null;
      return new Date(before.getTime() - r.interval_minutes * 60_000);
    }

    case "daily": {
      if (!r.time_of_day) return null;
      return zonedToUtc(addDays(localDate(before), -1), r.time_of_day);
    }

    case "weekly": {
      if (!r.time_of_day || !r.days_of_week?.length) return null;
      for (let i = 1; i <= 7; i++) {
        const date = addDays(localDate(before), -i);
        if (!r.days_of_week.includes(mondayIndex(date))) continue;
        return zonedToUtc(date, r.time_of_day);
      }
      return null;
    }

    case "monthly": {
      if (!r.time_of_day || !r.day_of_month) return null;
      const [y0, m0] = localDate(before).split("-").map(Number);
      for (let i = 1; i <= 13; i++) {
        const total = m0 - 1 - i;
        const y = y0 + Math.floor(total / 12);
        const m = ((total % 12) + 12) % 12 + 1;
        if (r.day_of_month > daysInMonth(y, m)) continue;
        const date = `${y}-${String(m).padStart(2, "0")}-${String(r.day_of_month).padStart(2, "0")}`;
        return zonedToUtc(date, r.time_of_day);
      }
      return null;
    }
  }
}

// How long one full cycle of this reminder lasts, in seconds — the span the
// countdown ring depletes across. Taken from the real gap between consecutive
// occurrences so a 30-minute interval sweeps the circle every 30 minutes,
// rather than against some arbitrary fixed window.
export function cycleSeconds(r: ReminderLike, now: Date): number | null {
  const next = nextFireAt(r, now);
  if (next === null) return null;
  const prev = previousFireAt(r, next);
  if (prev === null) return null;
  const span = Math.round((next.getTime() - prev.getTime()) / 1000);
  return span > 0 ? span : null;
}
