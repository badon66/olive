import { describe, expect, it } from "vitest";
import { buildInsight, type InsightTask } from "./insight";

const TODAY = "2026-07-07";

const t = (over: Partial<InsightTask> & { id: string; title: string }): InsightTask => ({
  due_date: TODAY,
  scheduled_time: null,
  time_section: null,
  priority_weight: 3,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

const base = {
  today: TODAY,
  nowSection: "afternoon" as const,
  nowTime: "14:00",
  doneToday: 2,
  overdue: 0,
  dueToday: 3,
};

describe("buildInsight", () => {
  it("leads with the next booking still ahead today", () => {
    const open = [
      t({ id: "a", title: "Dentist", scheduled_time: "15:30:00" }),
      t({ id: "b", title: "Standup", scheduled_time: "09:00:00" }), // already passed
    ];
    // 12-hour with AM/PM, never 24-hour (CLAUDE.md) — this expectation used to
    // encode the violation.
    expect(buildInsight({ ...base, open }).headline).toBe("Next: Dentist at 3:30 PM");
  });

  it("ignores bookings that have already passed", () => {
    const open = [t({ id: "b", title: "Standup", scheduled_time: "09:00:00" })];
    expect(buildInsight({ ...base, open }).headline).not.toContain("Standup");
  });

  it("falls back to the top-priority task in the current part of day", () => {
    const open = [
      t({ id: "lo", title: "Low job", time_section: "afternoon", priority_weight: 2 }),
      t({ id: "hi", title: "Site walkthrough", time_section: "afternoon", priority_weight: 5 }),
      t({ id: "other", title: "Evening thing", time_section: "evening", priority_weight: 5 }),
    ];
    expect(buildInsight({ ...base, open }).headline).toBe("Now: Site walkthrough");
  });

  it("surfaces overdue when nothing is live right now", () => {
    expect(buildInsight({ ...base, open: [], overdue: 2, dueToday: 0 }).headline).toContain("2 overdue");
  });

  it("says it plainly when the day is clear", () => {
    expect(buildInsight({ ...base, open: [], overdue: 0, dueToday: 0, doneToday: 0 }).headline).toBe(
      "Clear right now — nothing scheduled.",
    );
  });

  it("stat counts progress against the real total", () => {
    expect(buildInsight({ ...base, open: [], doneToday: 2, dueToday: 3, overdue: 1 }).stat).toBe(
      "2/6 done today · 1 overdue",
    );
  });

  it("does not repeat overdue in the stat when the headline already says it", () => {
    const i = buildInsight({ ...base, open: [], overdue: 2, dueToday: 0, doneToday: 1 });
    expect(i.headline).toContain("overdue");
    expect(i.stat).not.toContain("overdue");
  });
});

describe("buildInsight — multi-day tasks count on every day they occur", () => {
  it("a window task covering today is picked for 'Now', not only on its last day", () => {
    const open = [
      t({ id: "w", title: "Lookbook", due_date: "2026-07-09", time_section: "afternoon", window_start: "2026-07-06", window_end: "2026-07-09" }),
    ];
    expect(buildInsight({ ...base, open }).headline).toBe("Now: Lookbook");
  });
  it("a pick task with a booked time today is offered as 'Next'", () => {
    const open = [
      t({ id: "p", title: "Pickleball", due_date: "2026-07-10", scheduled_time: "18:00:00", candidate_dates: ["2026-07-07", "2026-07-10"] }),
    ];
    expect(buildInsight({ ...base, open }).headline).toBe("Next: Pickleball at 6:00 PM");
  });
  it("a pick task already ticked for today is not suggested again", () => {
    const open = [
      t({ id: "p", title: "Pickleball", due_date: "2026-07-10", time_section: "afternoon", candidate_dates: ["2026-07-07", "2026-07-10"], completed_dates: ["2026-07-07"] }),
    ];
    expect(buildInsight({ ...base, open }).headline).not.toContain("Pickleball");
  });
});
