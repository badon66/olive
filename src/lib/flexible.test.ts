import { describe, expect, it } from "vitest";
import {
  bestPlacement,
  candidatesFor,
  isFlexible,
  isFlexibleOverdue,
  loadByDay,
  planPlacements,
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

describe("planPlacements — one pass, no oscillation", () => {
  it("two tasks sharing candidates do NOT both flee to the same quiet day", () => {
    const A = t({ id: "A", window_start: "2026-08-14", window_end: "2026-08-15", placed_date: "2026-08-14", due_date: "2026-08-14" });
    const B = t({ id: "B", window_start: "2026-08-14", window_end: "2026-08-15", placed_date: "2026-08-14", due_date: "2026-08-14" });
    const l = loadByDay(
      [
        { due_date: "2026-08-14", status: "open", duration_minutes: 60 },
        { due_date: "2026-08-14", status: "open", duration_minutes: 60 },
      ],
      ["2026-08-14", "2026-08-15"],
    );
    const withDur = (x: FlexibleTask) => ({ ...x, duration_minutes: 60 });
    const moves = planPlacements([withDur(A), withDur(B)], TODAY, l);
    // Exactly ONE moves; the second sees the updated load and stays put.
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ id: "A", target: "2026-08-15" });
  });

  it("a follow-up pass after the move is a no-op (converged)", () => {
    // State after the pass above: A on d2, B on d1, 60 min each.
    const A = t({ id: "A", window_start: "2026-08-14", window_end: "2026-08-15", placed_date: "2026-08-15", due_date: "2026-08-15" });
    const B = t({ id: "B", window_start: "2026-08-14", window_end: "2026-08-15", placed_date: "2026-08-14", due_date: "2026-08-14" });
    const l = loadByDay(
      [
        { due_date: "2026-08-15", status: "open", duration_minutes: 60 },
        { due_date: "2026-08-14", status: "open", duration_minutes: 60 },
      ],
      ["2026-08-14", "2026-08-15"],
    );
    const withDur = (x: FlexibleTask) => ({ ...x, duration_minutes: 60 });
    expect(planPlacements([withDur(A), withDur(B)], TODAY, l)).toEqual([]);
  });

  it("still moves a task off a genuinely busy day", () => {
    const A = t({ id: "A", candidate_dates: ["2026-08-14", "2026-08-16"], placed_date: "2026-08-14", due_date: "2026-08-14" });
    const l = loadByDay(
      [{ due_date: "2026-08-14", status: "open", duration_minutes: 300 }],
      ["2026-08-14", "2026-08-16"],
    );
    expect(planPlacements([{ ...A, duration_minutes: 30 }], TODAY, l)).toEqual([
      { id: "A", target: "2026-08-16" },
    ]);
  });
});

// The live "Sept 6 / Sept 7" flicker (2026-09-04). The dashboard builds its load
// map from EVERY open task — including the flexible task itself, sitting on its
// current day. A 60-minute task alone in its window therefore saw "my day: 60,
// next day: 0", beat the 45-minute slack, moved, saw the mirror image, moved
// back. Its own weight must never count as a reason to leave.
describe("a task's own weight never counts against its current day", () => {
  const solo = (due: string): FlexibleTask & { duration_minutes: number } => ({
    ...t({ due_date: due, placed_date: due, window_start: "2026-08-16", window_end: "2026-08-18" }),
    duration_minutes: 60,
  });
  const horizon = ["2026-08-16", "2026-08-17", "2026-08-18"];

  it("a lone 60-minute task stays where it is", () => {
    const task = solo("2026-08-16");
    const l = loadByDay([task], horizon); // exactly what the dashboard feeds it
    expect(replacementFor(task, TODAY, l)).toBeNull();
  });

  it("…and is just as stable from the neighbouring day (no oscillation)", () => {
    const task = solo("2026-08-17");
    const l = loadByDay([task], horizon);
    expect(replacementFor(task, TODAY, l)).toBeNull();
  });

  it("replaying the dashboard's re-render loop converges instead of alternating", () => {
    let state = [solo("2026-08-16")];
    const seen: string[] = [];
    for (let pass = 0; pass < 6; pass++) {
      const l = loadByDay(state, horizon);
      const moves = planPlacements(state, TODAY, l);
      if (moves.length === 0) break;
      state = state.map((x) => (x.id === moves[0].id ? { ...x, due_date: moves[0].target, placed_date: moves[0].target } : x));
      seen.push(moves[0].target);
    }
    // At most one settling move, never a ping-pong.
    expect(seen.length).toBeLessThanOrEqual(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("still leaves a day that OTHER work has genuinely filled", () => {
    const task = solo("2026-08-16");
    const others = [{ due_date: "2026-08-16", status: "open", duration_minutes: 120 }];
    const l = loadByDay([task, ...others], horizon);
    expect(replacementFor(task, TODAY, l)).toBe("2026-08-17");
  });
});

// Second live finding: a window task whose due_date lies OUTSIDE its own window
// (due the 19th, window 16th–18th) was never placed — a day missing from the
// load map read as "0 minutes busy", so staying put always looked fine.
describe("a task sitting outside its window is placed onto a candidate", () => {
  it("moves onto the least-busy candidate day", () => {
    const task = {
      ...t({ due_date: "2026-08-19", placed_date: null, window_start: "2026-08-16", window_end: "2026-08-18" }),
      duration_minutes: 35,
    };
    const l = load([["2026-08-16", 60], ["2026-08-17", 0], ["2026-08-18", 0]]);
    expect(replacementFor(task, TODAY, l)).toBe("2026-08-17");
  });
});
