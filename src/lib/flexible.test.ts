import { describe, expect, it } from "vitest";
import {
  allDaysDone,
  dayIsDone,
  deadlineFor,
  isFlexible,
  isFlexibleOverdue,
  occurrenceDates,
  occursOn,
  schedulingMode,
  tasksOnDate,
  type ScheduledTask,
} from "./flexible";

const TODAY = "2026-09-24";

const t = (over: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: "t1",
  status: "open",
  due_date: null,
  window_start: null,
  window_end: null,
  candidate_dates: null,
  completed_dates: null,
  ...over,
});

const fixed = (d: string) => t({ due_date: d });
const window_ = (a: string, b: string) => t({ window_start: a, window_end: b, due_date: b });
const pick = (dates: string[], done: string[] = []) =>
  t({ candidate_dates: dates, completed_dates: done, due_date: dates[dates.length - 1] });

describe("schedulingMode — three shapes, inferred from which columns are set", () => {
  it("a plain due date is a fixed day", () => expect(schedulingMode(fixed(TODAY))).toBe("fixed"));
  it("a range is a window", () => expect(schedulingMode(window_("2026-09-24", "2026-09-26"))).toBe("window"));
  it("hand-picked dates are pick", () => expect(schedulingMode(pick(["2026-09-24"]))).toBe("pick"));
  it("an empty candidate list is not pick", () => expect(schedulingMode(t({ candidate_dates: [] }))).toBe("fixed"));
  it("isFlexible covers both multi-day shapes and nothing else", () => {
    expect(isFlexible(window_("2026-09-24", "2026-09-26"))).toBe(true);
    expect(isFlexible(pick(["2026-09-24"]))).toBe(true);
    expect(isFlexible(fixed(TODAY))).toBe(false);
  });
});

// The heart of the rework: a flexible task is no longer PLACED on one chosen
// day. It OCCURS on every day of its set.
describe("a WINDOW task occurs on every day from start to end", () => {
  const w = window_("2026-09-24", "2026-09-27");

  it("lists every day in the range, inclusive of both ends", () => {
    expect(occurrenceDates(w)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("occurs on the first day, the last day, and every day between", () => {
    for (const d of ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]) {
      expect(occursOn(w, d)).toBe(true);
    }
  });

  it("does not occur outside the range", () => {
    expect(occursOn(w, "2026-09-23")).toBe(false);
    expect(occursOn(w, "2026-09-28")).toBe(false);
  });

  it("a single-day window is just that day", () => {
    expect(occurrenceDates(window_(TODAY, TODAY))).toEqual([TODAY]);
  });

  it("a backwards range yields nothing rather than looping forever", () => {
    expect(occurrenceDates(window_("2026-09-27", "2026-09-24"))).toEqual([]);
  });

  // "Once it's completed within that range, it's removed, and it doesn't show
  // up for the next day."
  it("ONE completion removes it from every day of the window", () => {
    const done = { ...w, status: "completed" };
    for (const d of occurrenceDates(w)) expect(occursOn(done, d)).toBe(false);
  });

  it("completing it counts as done on every day it would have shown", () => {
    const done = { ...w, status: "completed" };
    expect(dayIsDone(done, "2026-09-25")).toBe(true);
  });
});

describe("a PICK-DAYS task occurs on each chosen day, independently", () => {
  const p = pick(["2026-09-24", "2026-09-26", "2026-09-29"]);

  it("occurs on exactly the chosen days and no others", () => {
    expect(occursOn(p, "2026-09-24")).toBe(true);
    expect(occursOn(p, "2026-09-26")).toBe(true);
    expect(occursOn(p, "2026-09-29")).toBe(true);
    expect(occursOn(p, "2026-09-25")).toBe(false);
    expect(occursOn(p, "2026-09-27")).toBe(false);
  });

  it("chosen days need not be contiguous, and come back sorted and de-duplicated", () => {
    expect(occurrenceDates(pick(["2026-09-29", "2026-09-24", "2026-09-29"]))).toEqual([
      "2026-09-24",
      "2026-09-29",
    ]);
  });

  // "every single day you select, it pops up, regardless of whether you
  // finished it that day or not" — finishing one day must NOT clear the others.
  it("finishing one day leaves every other chosen day still showing", () => {
    const partly = pick(["2026-09-24", "2026-09-26", "2026-09-29"], ["2026-09-24"]);
    expect(occursOn(partly, "2026-09-26")).toBe(true);
    expect(occursOn(partly, "2026-09-29")).toBe(true);
  });

  it("the finished day still shows, marked done for that day only", () => {
    const partly = pick(["2026-09-24", "2026-09-26"], ["2026-09-24"]);
    expect(occursOn(partly, "2026-09-24")).toBe(true);
    expect(dayIsDone(partly, "2026-09-24")).toBe(true);
    expect(dayIsDone(partly, "2026-09-26")).toBe(false);
  });

  it("is finished outright only once every chosen day is done", () => {
    expect(allDaysDone(pick(["2026-09-24", "2026-09-26"], ["2026-09-24"]))).toBe(false);
    expect(allDaysDone(pick(["2026-09-24", "2026-09-26"], ["2026-09-26", "2026-09-24"]))).toBe(true);
  });

  it("a completion recorded for a day that is no longer chosen doesn't fake completeness", () => {
    expect(allDaysDone(pick(["2026-09-24", "2026-09-26"], ["2026-09-24", "2026-10-02"]))).toBe(false);
  });
});

describe("a FIXED task is unchanged — one day, one completion", () => {
  it("occurs only on its due date", () => {
    expect(occursOn(fixed(TODAY), TODAY)).toBe(true);
    expect(occursOn(fixed(TODAY), "2026-09-25")).toBe(false);
  });
  it("an undated task occurs nowhere — it is backlog, not scheduled", () => {
    expect(occursOn(t(), TODAY)).toBe(false);
    expect(occurrenceDates(t())).toEqual([]);
  });
  it("completing it removes it from its day", () => {
    expect(occursOn({ ...fixed(TODAY), status: "completed" }, TODAY)).toBe(false);
  });
});

describe("deadlineFor — the due_date a flexible task stores", () => {
  // due_date stays meaningful as the DEADLINE (sorting, overdue, carryover all
  // read it); it is never what decides which days the task shows on.
  it("a window's deadline is its last day", () => {
    expect(deadlineFor(window_("2026-09-24", "2026-09-27"))).toBe("2026-09-27");
  });
  it("a pick list's deadline is its latest chosen day", () => {
    expect(deadlineFor(pick(["2026-09-29", "2026-09-24"]))).toBe("2026-09-29");
  });
  it("a fixed task's deadline is its own due date", () => {
    expect(deadlineFor(fixed(TODAY))).toBe(TODAY);
  });
});

describe("overdue only once every day is spent", () => {
  it("a window still open today is not overdue", () => {
    expect(isFlexibleOverdue(window_("2026-09-20", "2026-09-26"), TODAY)).toBe(false);
  });
  it("its final day still counts as open", () => {
    expect(isFlexibleOverdue(window_("2026-09-20", TODAY), TODAY)).toBe(false);
  });
  it("a fully expired window is overdue", () => {
    expect(isFlexibleOverdue(window_("2026-09-20", "2026-09-23"), TODAY)).toBe(true);
  });
  it("a pick list with a day still ahead is not overdue", () => {
    expect(isFlexibleOverdue(pick(["2026-09-20", "2026-09-29"]), TODAY)).toBe(false);
  });
  it("a pick list entirely in the past is overdue", () => {
    expect(isFlexibleOverdue(pick(["2026-09-20", "2026-09-22"]), TODAY)).toBe(true);
  });
  it("a completed task is never overdue, spent or not", () => {
    expect(isFlexibleOverdue({ ...window_("2026-09-20", "2026-09-23"), status: "completed" }, TODAY)).toBe(false);
  });
  it("a plain task falls back to the ordinary due-date rule", () => {
    expect(isFlexibleOverdue(fixed("2026-09-20"), TODAY)).toBe(true);
    expect(isFlexibleOverdue(fixed("2026-09-29"), TODAY)).toBe(false);
  });
});

describe("tasksOnDate — the single rule every day-grouped panel uses", () => {
  const all = [
    fixed("2026-09-25"),
    { ...window_("2026-09-24", "2026-09-26"), id: "w" },
    { ...pick(["2026-09-25", "2026-09-28"]), id: "p" },
    { ...t(), id: "backlog" },
  ];

  it("gathers fixed, window and pick tasks that share a day", () => {
    expect(tasksOnDate(all, "2026-09-25").map((x) => x.id).sort()).toEqual(["p", "t1", "w"]);
  });

  it("a window day with nothing else still yields the window task", () => {
    expect(tasksOnDate(all, "2026-09-24").map((x) => x.id)).toEqual(["w"]);
  });

  it("returns each task at most ONCE, even though its deadline is inside its own range", () => {
    const ids = tasksOnDate(all, "2026-09-26").map((x) => x.id);
    expect(ids).toEqual(["w"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never returns backlog or completed work", () => {
    expect(tasksOnDate(all, "2026-09-25").some((x) => x.id === "backlog")).toBe(false);
    const done = all.map((x) => ({ ...x, status: "completed" }));
    expect(tasksOnDate(done, "2026-09-25")).toEqual([]);
  });

  it("a partly-done pick task still appears on its remaining days", () => {
    const partly = [{ ...pick(["2026-09-25", "2026-09-28"], ["2026-09-25"]), id: "p" }];
    expect(tasksOnDate(partly, "2026-09-28").map((x) => x.id)).toEqual(["p"]);
    // …and on the day already done, so the day's record stays honest.
    expect(tasksOnDate(partly, "2026-09-25").map((x) => x.id)).toEqual(["p"]);
  });
});
