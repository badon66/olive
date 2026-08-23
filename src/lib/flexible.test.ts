import { describe, expect, it } from "vitest";
import {
  bestPlacement,
  candidatesFor,
  isFlexible,
  isFlexibleOverdue,
  loadByDay,
  remainingCandidates,
  replacementFor,
  type FlexibleTask,
} from "./flexible";

const TODAY = "2026-08-14";
const t = (over: Partial<FlexibleTask> = {}): FlexibleTask => ({
  id: "t1",
  status: "open",
  due_date: null,
  placed_date: null,
  window_start: null,
  window_end: null,
  candidate_dates: null,
  ...over,
});

const load = (pairs: [string, number][]) =>
  loadByDay(
    pairs.flatMap(([d, mins]) => [{ due_date: d, status: "open", duration_minutes: mins }]),
    pairs.map(([d]) => d),
  );

describe("candidatesFor — the two ways to express options", () => {
  it("expands a continuous range inclusively", () => {
    expect(candidatesFor(t({ window_start: "2026-08-14", window_end: "2026-08-17" }))).toEqual([
      "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17",
    ]);
  });
  it("a single-day range is just that day", () => {
    expect(candidatesFor(t({ window_start: TODAY, window_end: TODAY }))).toEqual([TODAY]);
  });
  it("hand-picked days are sorted and de-duplicated", () => {
    expect(candidatesFor(t({ candidate_dates: ["2026-08-20", "2026-08-16", "2026-08-20"] }))).toEqual([
      "2026-08-16", "2026-08-20",
    ]);
  });
  it("a non-flexible task has no candidates", () => {
    expect(candidatesFor(t({ due_date: TODAY }))).toEqual([]);
    expect(isFlexible(t({ due_date: TODAY }))).toBe(false);
  });
  it("hand-picked days need not be contiguous", () => {
    const picked = ["2026-08-14", "2026-08-19", "2026-09-02"];
    expect(candidatesFor(t({ candidate_dates: picked }))).toEqual(picked);
  });
});

describe("placement follows how busy each day is", () => {
  it("lands on the emptiest option", () => {
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-16" });
    const l = load([["2026-08-14", 240], ["2026-08-15", 30], ["2026-08-16", 120]]);
    expect(bestPlacement(task, TODAY, l)).toBe("2026-08-15");
  });

  it("ties break toward the earlier day — it drifts forward only when it must", () => {
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-16" });
    const l = load([["2026-08-14", 60], ["2026-08-15", 60], ["2026-08-16", 60]]);
    expect(bestPlacement(task, TODAY, l)).toBe("2026-08-14");
  });

  it("weighs duration, not raw task count", () => {
    // 4 short errands (4x15=60) vs one long job (180) — the busy day is the long one
    const l = loadByDay(
      [
        ...Array.from({ length: 4 }, () => ({ due_date: "2026-08-14", status: "open", duration_minutes: 15 })),
        { due_date: "2026-08-15", status: "open", duration_minutes: 180 },
      ],
      ["2026-08-14", "2026-08-15"],
    );
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-15" });
    expect(bestPlacement(task, TODAY, l)).toBe("2026-08-14");
  });

  it("ignores completed tasks when weighing a day", () => {
    const l = loadByDay(
      [
        { due_date: "2026-08-14", status: "completed", duration_minutes: 600 },
        { due_date: "2026-08-15", status: "open", duration_minutes: 60 },
      ],
      ["2026-08-14", "2026-08-15"],
    );
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-15" });
    expect(bestPlacement(task, TODAY, l)).toBe("2026-08-14");
  });

  it("never places on a day already past", () => {
    const task = t({ window_start: "2026-08-10", window_end: "2026-08-16" });
    const placed = bestPlacement(task, TODAY, load([["2026-08-16", 0]]));
    expect(placed! >= TODAY).toBe(true);
  });
});

describe("re-placement when a day gets busy", () => {
  it("moves to a quieter option once the current day fills up", () => {
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-16", placed_date: "2026-08-14" });
    const l = load([["2026-08-14", 300], ["2026-08-15", 30], ["2026-08-16", 60]]);
    expect(replacementFor(task, TODAY, l)).toBe("2026-08-15");
  });

  it("stays put when the difference is only marginal — no thrashing", () => {
    const task = t({ window_start: "2026-08-14", window_end: "2026-08-16", placed_date: "2026-08-14" });
    const l = load([["2026-08-14", 60], ["2026-08-15", 30], ["2026-08-16", 60]]);
    expect(replacementFor(task, TODAY, l)).toBeNull();
  });

  it("leaves a COMPLETED task exactly where it is, however busy the day", () => {
    const task = t({
      status: "completed",
      window_start: "2026-08-14", window_end: "2026-08-16", placed_date: "2026-08-14",
    });
    const l = load([["2026-08-14", 900], ["2026-08-15", 0]]);
    expect(replacementFor(task, TODAY, l)).toBeNull();
  });

  it("moves off a day that has already passed", () => {
    const task = t({ window_start: "2026-08-12", window_end: "2026-08-16", placed_date: "2026-08-12" });
    const l = load([["2026-08-14", 100], ["2026-08-15", 0], ["2026-08-16", 0]]);
    expect(replacementFor(task, TODAY, l)).toBe("2026-08-15");
  });

  it("places a never-placed task on first pass", () => {
    const task = t({ candidate_dates: ["2026-08-15", "2026-08-18"] });
    expect(replacementFor(task, TODAY, load([["2026-08-15", 0], ["2026-08-18", 0]]))).toBe("2026-08-15");
  });

  it("does not move a non-flexible task", () => {
    expect(replacementFor(t({ due_date: TODAY }), TODAY, load([]))).toBeNull();
  });
});

describe("overdue only once every option is exhausted", () => {
  it("is NOT overdue while a later option remains, even if today is busy", () => {
    const task = t({ window_start: "2026-08-10", window_end: "2026-08-20", placed_date: "2026-08-10" });
    expect(isFlexibleOverdue(task, TODAY)).toBe(false);
    expect(remainingCandidates(task, TODAY).length).toBeGreaterThan(0);
  });

  it("IS overdue once the whole window is in the past", () => {
    const task = t({ window_start: "2026-08-01", window_end: "2026-08-13" });
    expect(isFlexibleOverdue(task, TODAY)).toBe(true);
  });

  it("the final candidate day itself still counts as open", () => {
    const task = t({ candidate_dates: [TODAY] });
    expect(isFlexibleOverdue(task, TODAY)).toBe(false);
  });

  it("a completed task is never overdue, exhausted or not", () => {
    const task = t({ status: "completed", window_start: "2026-07-01", window_end: "2026-07-05" });
    expect(isFlexibleOverdue(task, TODAY)).toBe(false);
  });

  it("hand-picked days all in the past are exhausted", () => {
    expect(isFlexibleOverdue(t({ candidate_dates: ["2026-08-01", "2026-08-09"] }), TODAY)).toBe(true);
  });

  it("a plain task falls back to ordinary due_date overdue", () => {
    expect(isFlexibleOverdue(t({ due_date: "2026-08-01" }), TODAY)).toBe(true);
    expect(isFlexibleOverdue(t({ due_date: "2026-08-20" }), TODAY)).toBe(false);
  });
});
