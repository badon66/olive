import { describe, expect, it } from "vitest";
import {
  attemptDueAt,
  countdownLabel,
  cycleSeconds,
  describeRecurrence,
  dueOccurrence,
  dueReminders,
  isDue,
  isExhausted,
  needsAttempt,
  nextFireAt,
  secondsUntil,
  type FireLike,
  type ReminderLike,
} from "./reminders";

// July = MDT (UTC-6): 09:00 local = 15:00Z. January = MST (UTC-7): 09:00 = 16:00Z.
const base = (over: Partial<ReminderLike>): ReminderLike => ({
  recurrence_type: "daily",
  fire_at: null,
  interval_minutes: null,
  days_of_week: null,
  day_of_month: null,
  time_of_day: null,
  active: true,
  last_fired_at: null,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("one_time", () => {
  const r = base({ recurrence_type: "one_time", fire_at: "2026-07-10T15:00:00Z" });

  it("fires at its moment when still ahead", () => {
    expect(nextFireAt(r, new Date("2026-07-09T00:00:00Z"))?.toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });
  it("never fires again once past", () => {
    expect(nextFireAt(r, new Date("2026-07-10T15:00:01Z"))).toBeNull();
  });
  it("is due once the moment arrives, and not before", () => {
    expect(isDue(r, new Date("2026-07-10T14:59:00Z"))).toBe(false);
    expect(isDue(r, new Date("2026-07-10T15:00:00Z"))).toBe(true);
  });
  it("does not re-fire after it has fired", () => {
    const fired = { ...r, last_fired_at: "2026-07-10T15:00:00Z" };
    expect(isDue(fired, new Date("2026-07-20T00:00:00Z"))).toBe(false);
  });
});

describe("interval", () => {
  const r = base({ recurrence_type: "interval", interval_minutes: 30, created_at: "2026-07-01T00:00:00Z" });

  it("first fire is one interval after creation, not at creation", () => {
    expect(nextFireAt(r, new Date("2026-07-01T00:00:00Z"))?.toISOString()).toBe("2026-07-01T00:30:00.000Z");
  });
  it("steps every interval", () => {
    expect(nextFireAt(r, new Date("2026-07-01T00:30:00Z"))?.toISOString()).toBe("2026-07-01T01:00:00.000Z");
    expect(nextFireAt(r, new Date("2026-07-01T00:45:00Z"))?.toISOString()).toBe("2026-07-01T01:00:00.000Z");
  });
  it("stays anchored to creation so the cadence never drifts", () => {
    // Far in the future, slots still land on :00 and :30
    const next = nextFireAt(r, new Date("2026-07-05T12:07:00Z"))!;
    expect(next.toISOString()).toBe("2026-07-05T12:30:00.000Z");
  });
  it("catches up exactly once after a long gap, not once per missed slot", () => {
    const stale = { ...r, last_fired_at: "2026-07-01T00:30:00Z" };
    expect(isDue(stale, new Date("2026-07-01T05:00:00Z"))).toBe(true);
    const next = nextFireAt(stale, new Date(stale.last_fired_at!))!;
    expect(next.toISOString()).toBe("2026-07-01T01:00:00.000Z");
  });
  it("supports hour-scale intervals", () => {
    const hourly = base({ recurrence_type: "interval", interval_minutes: 120, created_at: "2026-07-01T00:00:00Z" });
    expect(nextFireAt(hourly, new Date("2026-07-01T03:00:00Z"))?.toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });
});

describe("daily", () => {
  const r = base({ recurrence_type: "daily", time_of_day: "09:00" });

  it("fires today when the time is still ahead (09:00 MDT = 15:00Z)", () => {
    expect(nextFireAt(r, new Date("2026-07-10T05:00:00Z"))?.toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });
  it("rolls to tomorrow once today's slot has passed", () => {
    expect(nextFireAt(r, new Date("2026-07-10T15:00:01Z"))?.toISOString()).toBe("2026-07-11T15:00:00.000Z");
  });
  it("keeps the same wall-clock time across DST (MST = 16:00Z)", () => {
    expect(nextFireAt(r, new Date("2026-01-10T05:00:00Z"))?.toISOString()).toBe("2026-01-10T16:00:00.000Z");
  });
});

describe("weekly", () => {
  // 2026-07-10 is a Friday. Mon=0 … Sun=6, so Mon/Wed/Fri = [0,2,4].
  const r = base({ recurrence_type: "weekly", time_of_day: "09:00", days_of_week: [0, 2, 4] });

  it("fires today when today is a selected day and the time is ahead", () => {
    expect(nextFireAt(r, new Date("2026-07-10T05:00:00Z"))?.toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });
  it("skips to the next selected day once today's slot passed (Fri → Mon)", () => {
    expect(nextFireAt(r, new Date("2026-07-10T15:00:01Z"))?.toISOString()).toBe("2026-07-13T15:00:00.000Z");
  });
  it("skips unselected days entirely (Sat → Mon)", () => {
    expect(nextFireAt(r, new Date("2026-07-11T05:00:00Z"))?.toISOString()).toBe("2026-07-13T15:00:00.000Z");
  });
  it("handles a single-day-a-week reminder (Sundays)", () => {
    const sun = { ...r, days_of_week: [6] };
    expect(nextFireAt(sun, new Date("2026-07-10T05:00:00Z"))?.toISOString()).toBe("2026-07-12T15:00:00.000Z");
  });
  it("handles every day selected", () => {
    const all = { ...r, days_of_week: [0, 1, 2, 3, 4, 5, 6] };
    expect(nextFireAt(all, new Date("2026-07-10T15:00:01Z"))?.toISOString()).toBe("2026-07-11T15:00:00.000Z");
  });
});

describe("monthly", () => {
  const r = base({ recurrence_type: "monthly", time_of_day: "09:00", day_of_month: 15 });

  it("fires this month when the day is still ahead", () => {
    expect(nextFireAt(r, new Date("2026-07-10T05:00:00Z"))?.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });
  it("rolls to next month once this month's slot passed", () => {
    expect(nextFireAt(r, new Date("2026-07-15T15:00:01Z"))?.toISOString()).toBe("2026-08-15T15:00:00.000Z");
  });
  it("skips months too short for the chosen day instead of sliding", () => {
    // The 31st: after Jan 31 the next valid month is March, not "Feb 31"/Mar 3
    const end = base({ recurrence_type: "monthly", time_of_day: "09:00", day_of_month: 31 });
    expect(nextFireAt(end, new Date("2026-01-31T17:00:00Z"))?.toISOString()).toBe("2026-03-31T15:00:00.000Z");
  });
  it("handles the 29th in a non-leap February by skipping to March", () => {
    const r29 = base({ recurrence_type: "monthly", time_of_day: "09:00", day_of_month: 29 });
    expect(nextFireAt(r29, new Date("2026-02-01T05:00:00Z"))?.toISOString()).toBe("2026-03-29T15:00:00.000Z");
  });
  it("crosses the year boundary", () => {
    expect(nextFireAt(r, new Date("2026-12-20T05:00:00Z"))?.toISOString()).toBe("2027-01-15T16:00:00.000Z");
  });
});

describe("isDue / dueReminders", () => {
  it("an inactive reminder is never due", () => {
    const r = base({ recurrence_type: "daily", time_of_day: "09:00", active: false });
    expect(isDue(r, new Date("2026-07-10T23:00:00Z"))).toBe(false);
  });

  it("picks out only the reminders that have come due", () => {
    const ready = base({
      recurrence_type: "daily",
      time_of_day: "09:00",
      created_at: "2026-07-09T00:00:00Z",
    });
    // Created 9am local Jul 10; its 11pm slot is still ahead of "now" (10am local)
    const notYet = base({
      recurrence_type: "daily",
      time_of_day: "23:00",
      created_at: "2026-07-10T15:00:00Z",
    });
    const due = dueReminders([ready, notYet], new Date("2026-07-10T16:00:00Z"));
    expect(due).toEqual([ready]);
  });

  it("every recurrence type can become due", () => {
    const now = new Date("2026-07-10T16:00:00Z");
    const all: ReminderLike[] = [
      base({ recurrence_type: "one_time", fire_at: "2026-07-10T15:00:00Z" }),
      base({ recurrence_type: "interval", interval_minutes: 30 }),
      base({ recurrence_type: "daily", time_of_day: "09:00" }),
      base({ recurrence_type: "weekly", time_of_day: "09:00", days_of_week: [4] }),
      base({ recurrence_type: "monthly", time_of_day: "09:00", day_of_month: 5 }),
    ];
    expect(dueReminders(all, now)).toHaveLength(5);
  });
});

describe("describeRecurrence", () => {
  it("summarises each shape", () => {
    expect(describeRecurrence(base({ recurrence_type: "interval", interval_minutes: 30 }))).toBe("Every 30 min");
    expect(describeRecurrence(base({ recurrence_type: "interval", interval_minutes: 120 }))).toBe("Every 2 hours");
    expect(describeRecurrence(base({ recurrence_type: "daily", time_of_day: "09:00" }))).toBe("Daily at 9:00 AM");
    expect(
      describeRecurrence(base({ recurrence_type: "weekly", time_of_day: "17:30", days_of_week: [0, 4] })),
    ).toBe("Mon, Fri at 5:30 PM");
    expect(describeRecurrence(base({ recurrence_type: "monthly", time_of_day: "12:00", day_of_month: 3 }))).toBe(
      "Day 3 at 12:00 PM",
    );
  });
});

// ── Firing instances (BUILD_PLAN: the reminder_fires model) ─────────────────
// A fire row is the durable record that one OCCURRENCE came due. It is what
// makes an alert survive the app being closed, and what the repeat-until-
// dismissed cadence counts against.

describe("dueOccurrence — WHICH slot came due, not just whether one did", () => {
  // Anchored on the last firing, so the slot under test is today’s, not the
  // backlog stretching to created_at.
  const r = base({ recurrence_type: "daily", time_of_day: "09:00", last_fired_at: "2026-07-09T15:00:00Z" });

  it("returns the exact occurrence instant, so it can key a fire row", () => {
    const at = dueOccurrence(r, new Date("2026-07-10T15:30:00Z"));
    expect(at?.toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });

  it("returns null before the slot arrives", () => {
    expect(dueOccurrence(r, new Date("2026-07-10T14:59:00Z"))).toBeNull();
  });

  it("an inactive reminder never has a due occurrence", () => {
    expect(dueOccurrence({ ...r, active: false }, new Date("2026-07-10T15:30:00Z"))).toBeNull();
  });

  it("agrees with isDue on every case (one rule, two shapes)", () => {
    for (const now of ["2026-07-10T14:59:00Z", "2026-07-10T15:00:00Z", "2026-07-11T20:00:00Z"]) {
      expect(dueOccurrence(r, new Date(now)) !== null).toBe(isDue(r, new Date(now)));
    }
  });

  it("after firing, the SAME occurrence is not due again — it advances", () => {
    const fired = { ...r, last_fired_at: "2026-07-10T15:00:00Z" };
    expect(dueOccurrence(fired, new Date("2026-07-10T15:30:00Z"))).toBeNull();
    // …and the next day's slot is the next one offered.
    expect(dueOccurrence(fired, new Date("2026-07-11T16:00:00Z"))?.toISOString()).toBe(
      "2026-07-11T15:00:00.000Z",
    );
  });

  it("a long outage catches up ONCE, on the MOST RECENT slot", () => {
    const stale = { ...r, last_fired_at: "2026-07-01T15:00:00Z" };
    // Ten days of missed 09:00s produce ONE alert — today's, not the oldest —
    // so stamping it leaves the schedule fully caught up rather than nine slots
    // behind, crawling forward one per tick.
    expect(dueOccurrence(stale, new Date("2026-07-11T20:00:00Z"))?.toISOString()).toBe(
      "2026-07-11T15:00:00.000Z",
    );
  });

  it("an interval reminder also lands on its most recent slot after an outage", () => {
    const every30 = base({
      recurrence_type: "interval",
      interval_minutes: 30,
      created_at: "2026-07-01T00:00:00Z",
      last_fired_at: "2026-07-01T00:30:00Z",
    });
    // 90 minutes of silence: the 02:00 slot, not the 01:00 one.
    expect(dueOccurrence(every30, new Date("2026-07-01T02:05:00Z"))?.toISOString()).toBe(
      "2026-07-01T02:00:00.000Z",
    );
  });

  it("a single missed slot is returned unchanged", () => {
    const fired = { ...r, last_fired_at: "2026-07-09T15:00:00Z" };
    expect(dueOccurrence(fired, new Date("2026-07-10T15:30:00Z"))?.toISOString()).toBe(
      "2026-07-10T15:00:00.000Z",
    );
  });
});

describe("repeat-until-dismissed cadence", () => {
  // BUILD_PLAN default policy: 10 attempts, 20 seconds apart, then quiet.
  const policy = { max_repeats: 10, repeat_interval_seconds: 20 };
  const fire = (over: Partial<FireLike> = {}): FireLike => ({
    fired_at: "2026-07-10T15:00:00Z",
    dismissed: false,
    repeat_count: 0,
    ...over,
  });

  it("the first attempt is due immediately, not one interval later", () => {
    expect(attemptDueAt(fire(), policy).toISOString()).toBe("2026-07-10T15:00:00.000Z");
  });

  it("each subsequent attempt is one interval further out", () => {
    expect(attemptDueAt(fire({ repeat_count: 1 }), policy).toISOString()).toBe("2026-07-10T15:00:20.000Z");
    expect(attemptDueAt(fire({ repeat_count: 9 }), policy).toISOString()).toBe("2026-07-10T15:03:00.000Z");
  });

  it("waits for the interval before re-alerting", () => {
    const f = fire({ repeat_count: 1 });
    expect(needsAttempt(f, policy, new Date("2026-07-10T15:00:10Z"))).toBe(false);
    expect(needsAttempt(f, policy, new Date("2026-07-10T15:00:20Z"))).toBe(true);
  });

  it("gives up quietly after exactly 10 attempts", () => {
    const spent = fire({ repeat_count: 10 });
    expect(isExhausted(spent, policy)).toBe(true);
    // Long past the last attempt's slot, it still must not alert again.
    expect(needsAttempt(spent, policy, new Date("2026-07-10T18:00:00Z"))).toBe(false);
  });

  it("the 10th attempt itself still fires — the cap is attempts, not intervals", () => {
    expect(isExhausted(fire({ repeat_count: 9 }), policy)).toBe(false);
    expect(needsAttempt(fire({ repeat_count: 9 }), policy, new Date("2026-07-10T15:03:00Z"))).toBe(true);
  });

  it("a dismissed fire never alerts again, however few attempts it used", () => {
    const done = fire({ dismissed: true, repeat_count: 1 });
    expect(needsAttempt(done, policy, new Date("2026-07-10T16:00:00Z"))).toBe(false);
  });

  it("honours a per-reminder policy that differs from the default", () => {
    const brisk = { max_repeats: 2, repeat_interval_seconds: 5 };
    expect(attemptDueAt(fire({ repeat_count: 1 }), brisk).toISOString()).toBe("2026-07-10T15:00:05.000Z");
    expect(isExhausted(fire({ repeat_count: 2 }), brisk)).toBe(true);
  });
});

describe("countdown ring inputs", () => {
  it("reports the whole seconds left until the next fire", () => {
    expect(secondsUntil(new Date("2026-07-10T15:00:30Z"), new Date("2026-07-10T15:00:00Z"))).toBe(30);
  });

  it("never goes negative once the moment has passed", () => {
    expect(secondsUntil(new Date("2026-07-10T15:00:00Z"), new Date("2026-07-10T15:05:00Z"))).toBe(0);
  });

  it("has nothing to count down to when there is no next fire", () => {
    expect(secondsUntil(null, new Date("2026-07-10T15:00:00Z"))).toBeNull();
  });

  it("compact labels stay readable at every scale", () => {
    expect(countdownLabel(0)).toBe("now");
    expect(countdownLabel(45)).toBe("45s");
    expect(countdownLabel(90)).toBe("1m 30s");
    expect(countdownLabel(3600)).toBe("1h 00m");
    expect(countdownLabel(86_400 * 2 + 3600)).toBe("2d 1h");
  });

  // The ring depletes over the gap between the PREVIOUS occurrence and the next,
  // so a 30-minute interval sweeps a full circle every 30 minutes rather than
  // jumping about with an arbitrary fixed span.
  it("the ring spans the gap between consecutive occurrences", () => {
    const r = base({ recurrence_type: "interval", interval_minutes: 30, created_at: "2026-07-10T15:00:00Z" });
    expect(cycleSeconds(r, new Date("2026-07-10T15:10:00Z"))).toBe(30 * 60);
  });

  it("a daily reminder's ring spans a day", () => {
    const r = base({ recurrence_type: "daily", time_of_day: "09:00" });
    expect(cycleSeconds(r, new Date("2026-07-10T12:00:00Z"))).toBe(24 * 3600);
  });

  it("a one-time reminder counts down from when it was created", () => {
    const r = base({
      recurrence_type: "one_time",
      fire_at: "2026-07-10T15:00:00Z",
      created_at: "2026-07-10T14:00:00Z",
    });
    expect(cycleSeconds(r, new Date("2026-07-10T14:30:00Z"))).toBe(3600);
  });
});
