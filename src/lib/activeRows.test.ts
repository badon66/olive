import { describe, expect, it } from "vitest";
import { buildActiveRows, type ActiveTaskLike, type ActiveWeeklyLike } from "./activeRows";

const TODAY = "2026-10-28";

const task = (id: string, p: Partial<ActiveTaskLike> = {}): ActiveTaskLike => ({
  id,
  title: id,
  status: "open",
  due_date: TODAY,
  window_start: null,
  window_end: null,
  candidate_dates: null,
  completed_dates: null,
  time_section: "midday",
  sort_order: null,
  scheduled_time: null,
  priority_weight: 2,
  created_at: "2026-10-01T00:00:00Z",
  ...p,
});

const weekly = (id: string, p: Partial<ActiveWeeklyLike> = {}): ActiveWeeklyLike => ({
  id,
  name: id,
  recurrence_mode: "fixed_days",
  scheduled_days: [0, 1, 2, 3, 4, 5, 6],
  target_per_week: null,
  paused: false,
  sort_order: null,
  time_section: "midday",
  priority_weight: 2,
  ...p,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("buildActiveRows — the Active Tasks rules as one function", () => {
  it("an empty section promotes every anytime task directly into the main list", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [task("any-low", { time_section: "anytime", priority_weight: 1 }), task("any-urgent", { time_section: "anytime", priority_weight: 3 })],
      weeklyTasks: [],
      checkins: [],
    });
    expect(r.promoted).toBe(true);
    expect(ids(r.mainRows)).toEqual(["any-urgent", "any-low"]);
    expect(r.surfacedRows).toEqual([]);
    expect(r.dropdown).toEqual([]);
  });

  it("a busy section (3 own) surfaces only urgent anytime work; medium and low fold away", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [
        task("own-a"),
        task("own-b"),
        task("own-c"),
        task("any-urgent", { time_section: "anytime", priority_weight: 3 }),
        task("any-medium", { time_section: "anytime", priority_weight: 2 }),
        task("any-low", { time_section: "anytime", priority_weight: 1 }),
      ],
      weeklyTasks: [],
      checkins: [],
    });
    expect(r.ownUncompleted).toBe(3);
    expect(ids(r.mainRows)).toEqual(["own-a", "own-b", "own-c"]);
    expect(ids(r.surfacedRows)).toEqual(["any-urgent"]);
    expect(ids(r.dropdown)).toEqual(["any-medium", "any-low"]);
    expect(r.total).toBe(6);
  });

  it("a light section (2 own, weekly included) surfaces medium too", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [
        task("own-a"),
        task("any-medium", { time_section: "anytime", priority_weight: 2 }),
        task("any-low", { time_section: "anytime", priority_weight: 1 }),
      ],
      weeklyTasks: [weekly("w-walk")],
      checkins: [],
    });
    expect(r.ownUncompleted).toBe(2);
    expect(ids(r.surfacedRows)).toEqual(["any-medium"]);
    expect(ids(r.dropdown)).toEqual(["any-low"]);
  });

  it("a weekly occurrence already done today no longer counts as uncompleted own work", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [task("own-a"), task("own-b"), task("any-medium", { time_section: "anytime", priority_weight: 2 })],
      weeklyTasks: [weekly("w-walk")],
      checkins: [{ weekly_task_id: "w-walk", date: TODAY, status: "completed" }],
    });
    expect(r.ownUncompleted).toBe(2);
    expect(r.isWeeklyDone("w-walk")).toBe(true);
    expect(ids(r.surfacedRows)).toEqual(["any-medium"]);
  });

  it("an OVERDUE urgent anytime task sorts to the very top of the main list, not into the surfaced group", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [
        task("own-a"),
        task("own-b"),
        task("own-c"),
        task("any-overdue-urgent", { time_section: "anytime", priority_weight: 3, due_date: "2026-10-26" }),
        task("any-urgent", { time_section: "anytime", priority_weight: 3 }),
      ],
      weeklyTasks: [],
      checkins: [],
    });
    expect(ids(r.mainRows)).toEqual(["any-overdue-urgent", "own-a", "own-b", "own-c"]);
    expect(ids(r.surfacedRows)).toEqual(["any-urgent"]);
  });

  it("an urgent anytime WEEKLY occurrence surfaces like an urgent anytime task", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [task("own-a"), task("own-b"), task("own-c")],
      weeklyTasks: [weekly("w-vitamins", { time_section: "anytime", priority_weight: 3 }), weekly("w-stretch", { time_section: "anytime", priority_weight: 1 })],
      checkins: [],
    });
    expect(ids(r.surfacedRows)).toEqual(["w-vitamins"]);
    expect(ids(r.dropdown)).toEqual(["w-stretch"]);
  });

  it("a one-day override moving a weekly occurrence into the section makes it the section's own work", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [],
      weeklyTasks: [weekly("w-gym", { time_section: "evening" })],
      checkins: [],
      dayOverrides: [{ weekly_task_id: "w-gym", date: TODAY, name: null, time_section: "midday", scheduled_time: "13:00" }],
    });
    expect(ids(r.ownRows)).toEqual(["w-gym"]);
    expect(r.mainRows[0].kind === "weekly" && r.mainRows[0].weekly.scheduled_time).toBe("13:00");
  });

  it("a paused or skipped weekly task never appears", () => {
    const r = buildActiveRows({
      section: "midday",
      today: TODAY,
      dueToday: [],
      weeklyTasks: [weekly("w-paused", { paused: true }), weekly("w-skipped")],
      checkins: [{ weekly_task_id: "w-skipped", date: TODAY, status: "skipped" }],
    });
    expect(r.total).toBe(0);
  });
});
