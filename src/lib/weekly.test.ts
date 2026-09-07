import { describe, expect, it } from "vitest";
import { appearsOn, cubeClickAction, cubeStates, mondayIndex, progress, weekDates } from "./weekly";

// 2026-07-07 is a Tuesday; its week runs Mon 2026-07-06 … Sun 2026-07-12
const TODAY = "2026-07-07";

const fixedDays = (days: number[]) => ({
  id: "wt1",
  recurrence_mode: "fixed_days" as const,
  scheduled_days: days,
  target_per_week: null,
});
const countMode = (target: number) => ({
  id: "wt1",
  recurrence_mode: "count" as const,
  scheduled_days: null,
  target_per_week: target,
});
const checkin = (date: string, status: "planned" | "completed") => ({
  weekly_task_id: "wt1",
  date,
  status,
});

describe("weekDates / mondayIndex", () => {
  it("returns Monday-first dates of the current week", () => {
    const w = weekDates(TODAY);
    expect(w[0]).toBe("2026-07-06"); // Mon
    expect(w[6]).toBe("2026-07-12"); // Sun
    expect(w).toHaveLength(7);
  });
  it("mondayIndex maps Mon→0 … Sun→6", () => {
    expect(mondayIndex("2026-07-06")).toBe(0);
    expect(mondayIndex("2026-07-07")).toBe(1);
    expect(mondayIndex("2026-07-12")).toBe(6);
  });
});

describe("cubeStates", () => {
  it("fixed_days: scheduled weekdays light up planned automatically, no checkin rows needed", () => {
    // Mon/Wed/Fri
    expect(cubeStates(fixedDays([0, 2, 4]), [], TODAY)).toEqual([
      "planned", "empty", "planned", "empty", "planned", "empty", "empty",
    ]);
  });
  it("cubes are independent: Monday completed while Wed/Fri stay planned", () => {
    expect(cubeStates(fixedDays([0, 2, 4]), [checkin("2026-07-06", "completed")], TODAY)).toEqual([
      "completed", "empty", "planned", "empty", "planned", "empty", "empty",
    ]);
  });
  it("count mode: all empty until days are planned by dragging", () => {
    expect(cubeStates(countMode(3), [], TODAY)).toEqual([
      "empty", "empty", "empty", "empty", "empty", "empty", "empty",
    ]);
  });
  it("count mode: planned checkin lights just that cube; completing darkens only it", () => {
    const rows = [checkin("2026-07-07", "planned"), checkin("2026-07-09", "planned"), checkin("2026-07-06", "completed")];
    expect(cubeStates(countMode(3), rows, TODAY)).toEqual([
      "completed", "planned", "empty", "planned", "empty", "empty", "empty",
    ]);
  });
  it("only this week's checkins count — the week resets on Monday", () => {
    // Checkin from last week ignored
    expect(cubeStates(countMode(2), [checkin("2026-07-05", "completed")], TODAY)).toEqual([
      "empty", "empty", "empty", "empty", "empty", "empty", "empty",
    ]);
  });
});

describe("progress", () => {
  it("count mode: target/planned/completed/toPlan always add up", () => {
    const rows = [checkin("2026-07-06", "completed"), checkin("2026-07-09", "planned")];
    const p = progress(countMode(3), cubeStates(countMode(3), rows, TODAY));
    expect(p).toEqual({ target: 3, planned: 1, completed: 1, toPlan: 1 });
    expect(p.planned + p.completed + p.toPlan).toBe(p.target);
  });
  it("fixed_days: target = number of scheduled days, toPlan stays 0 (auto-planned)", () => {
    const states = cubeStates(fixedDays([0, 2, 4]), [checkin("2026-07-06", "completed")], TODAY);
    expect(progress(fixedDays([0, 2, 4]), states)).toEqual({ target: 3, planned: 2, completed: 1, toPlan: 0 });
  });
  it("over-target completion never yields negative toPlan", () => {
    const rows = [checkin("2026-07-06", "completed"), checkin("2026-07-07", "completed")];
    const p = progress(countMode(1), cubeStates(countMode(1), rows, TODAY));
    expect(p.toPlan).toBe(0);
  });
});

describe("appearsOn", () => {
  it("fixed_days: appears only on scheduled weekdays", () => {
    expect(appearsOn(fixedDays([1]), [], TODAY)).toBe(true); // Tue scheduled
    expect(appearsOn(fixedDays([0, 2]), [], TODAY)).toBe(false);
  });
  it("count: appears while the week's completions are under target, then stops", () => {
    expect(appearsOn(countMode(2), [checkin("2026-07-06", "completed")], TODAY)).toBe(true);
    expect(
      appearsOn(countMode(2), [checkin("2026-07-06", "completed"), checkin("2026-07-07", "completed")], TODAY),
    ).toBe(false);
  });
});

// Pencil OFF, a cube click walks a two-stage cycle: empty → planned →
// completed → back to empty. One click never jumps straight to completed.
describe("cubeClickAction — the pencil-OFF click cycle", () => {
  it("empty → plan", () => expect(cubeClickAction("empty")).toBe("plan"));
  it("planned → complete", () => expect(cubeClickAction("planned")).toBe("complete"));
  it("completed → clear (back to empty)", () => expect(cubeClickAction("completed")).toBe("clear"));
  it("skipped → clear (restore, unchanged behaviour)", () => expect(cubeClickAction("skipped")).toBe("clear"));
});
