import { describe, expect, it } from "vitest";
import { describeRecurrence, dueReminders, isDue, nextFireAt, type ReminderLike } from "./reminders";

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
