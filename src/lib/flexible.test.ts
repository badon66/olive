import { describe, expect, it } from "vitest";
import {
  allDaysDone,
  completeDayPatch,
  dayDropPatch,
  dayIsDone,
  deadlineFor,
  dropPatch,
  isFlexible,
  isFlexibleOverdue,
  occurrenceDates,
  occursOn,
  onDayPatch,
  reconcileOnEdit,
  reopenPatch,
  schedulingMode,
  showsOnDate,
  skipDayPatch,
  skipIsPointless,
  tasksOnDate,
  whenLabel,
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

// A multi-day task shows its RANGE, never a single date. One date on a task
// that belongs to four days reads as "that day", and when that single date
// changed (the old scheduler) it looked like the date was flickering.
describe("whenLabel — what the date chip says", () => {
  it("a fixed task keeps its relative label", () => {
    expect(whenLabel(fixed(TODAY), TODAY)).toEqual({ text: "Today", overdue: false });
    expect(whenLabel(fixed("2026-09-25"), TODAY)).toEqual({ text: "Tomorrow", overdue: false });
    expect(whenLabel(fixed("2026-09-21"), TODAY)).toEqual({ text: "3d overdue", overdue: true });
  });

  it("a window inside one month reads as a compact range", () => {
    expect(whenLabel(window_("2026-09-24", "2026-09-28"), TODAY)?.text).toBe("Sep 24–28");
  });

  it("a window crossing a month names both months", () => {
    expect(whenLabel(window_("2026-09-29", "2026-10-02"), TODAY)?.text).toBe("Sep 29 – Oct 2");
  });

  it("a one-day window is just that day", () => {
    expect(whenLabel(window_("2026-09-26", "2026-09-26"), TODAY)?.text).toBe("Sep 26");
  });

  it("a pick list names its days, month shown once", () => {
    expect(whenLabel(pick(["2026-09-24", "2026-09-26", "2026-09-29"]), TODAY)?.text).toBe("Sep 24, 26, 29");
  });

  it("a pick list crossing a month names the new month where it changes", () => {
    expect(whenLabel(pick(["2026-09-29", "2026-10-01", "2026-10-03"]), TODAY)?.text).toBe("Sep 29, Oct 1, 3");
  });

  it("a long pick list collapses to its span and a day count", () => {
    const many = ["2026-09-24", "2026-09-25", "2026-09-27", "2026-09-30", "2026-10-02"];
    expect(whenLabel(pick(many), TODAY)?.text).toBe("Sep 24 – Oct 2 · 5 days");
  });

  it("a range still running is not overdue, even though it started in the past", () => {
    expect(whenLabel(window_("2026-09-20", "2026-09-26"), TODAY)).toEqual({ text: "Sep 20–26", overdue: false });
  });

  it("a range that has fully passed while still open says so", () => {
    expect(whenLabel(window_("2026-09-18", "2026-09-22"), TODAY)).toEqual({
      text: "Sep 18–22 · overdue",
      overdue: true,
    });
  });

  it("the label for a range never depends on which day you look at it from", () => {
    // Same task, three different days: same range text. This is the property
    // that makes a flicker impossible.
    const w = window_("2026-09-24", "2026-09-28");
    const seen = new Set(["2026-09-24", "2026-09-26", "2026-09-28"].map((d) => whenLabel(w, d)?.text));
    expect([...seen]).toEqual(["Sep 24–28"]);
  });

  it("an undated task has no date chip", () => {
    expect(whenLabel(t(), TODAY)).toBeNull();
  });
});

// History-including views (Upcoming Days) show finished work struck through on
// the day it belonged to — occursOn deliberately does not, since it answers
// "what is still to do on this day".
describe("showsOnDate — a day's record, finished work included", () => {
  const doneAt = (iso: string) => ({ status: "completed", completed_at: iso });

  it("open work is exactly what occursOn says", () => {
    const w = window_("2026-09-24", "2026-09-27");
    for (const d of ["2026-09-23", "2026-09-24", "2026-09-27", "2026-09-28"]) {
      expect(showsOnDate(w, d)).toBe(occursOn(w, d));
    }
  });

  it("a finished fixed task stays on its own day", () => {
    const f = { ...fixed("2026-09-24"), ...doneAt("2026-09-24T18:00:00Z") };
    expect(showsOnDate(f, "2026-09-24")).toBe(true);
    expect(showsOnDate(f, "2026-09-25")).toBe(false);
  });

  it("a finished window shows on the day it was finished — and no later day", () => {
    // Finished on the 25th (noon Edmonton), inside a 24–27 window.
    const w = { ...window_("2026-09-24", "2026-09-27"), ...doneAt("2026-09-25T18:00:00Z") };
    expect(showsOnDate(w, "2026-09-25")).toBe(true);
    expect(showsOnDate(w, "2026-09-26")).toBe(false);
    expect(showsOnDate(w, "2026-09-27")).toBe(false);
    // …and not on the earlier day either: it wasn't done then.
    expect(showsOnDate(w, "2026-09-24")).toBe(false);
  });

  it("a window finished outside its range is recorded on its last day", () => {
    const late = { ...window_("2026-09-20", "2026-09-22"), ...doneAt("2026-09-25T18:00:00Z") };
    expect(showsOnDate(late, "2026-09-22")).toBe(true);
    expect(showsOnDate(late, "2026-09-25")).toBe(false);
  });

  it("a fully finished pick task shows done on every chosen day", () => {
    const p = { ...pick(["2026-09-24", "2026-09-26"], ["2026-09-24", "2026-09-26"]), ...doneAt("2026-09-26T18:00:00Z") };
    expect(showsOnDate(p, "2026-09-24")).toBe(true);
    expect(showsOnDate(p, "2026-09-26")).toBe(true);
    expect(showsOnDate(p, "2026-09-25")).toBe(false);
  });

  it("backlog never shows on any day, finished or not", () => {
    expect(showsOnDate(t(), "2026-09-24")).toBe(false);
    expect(showsOnDate({ ...t(), ...doneAt("2026-09-24T18:00:00Z") }, "2026-09-24")).toBe(false);
  });
});

// ── Moving a task, whatever its shape ───────────────────────────────────────
// Every move used to rewrite due_date alone. For a window/pick task that moved
// nothing (occursOn reads the range, not due_date) but corrupted the deadline —
// the date chip jumped, and next day the task was flagged overdue and dumped in
// Carryover while its window was still running. These patches are shape-aware.

describe("onDayPatch — put a task on exactly one day", () => {
  it("makes it a plain single-day task, clearing any range or picked days", () => {
    expect(onDayPatch("2026-09-26")).toEqual({
      due_date: "2026-09-26",
      window_start: null,
      window_end: null,
      candidate_dates: null,
      completed_dates: null,
    });
  });
});

describe("dropPatch — dragging a task into a part of a day", () => {
  it("a window task moved to another part of a day it already covers keeps all its days", () => {
    expect(dropPatch(window_("2026-09-24", "2026-09-28"), "2026-09-24", "evening")).toEqual({ time_section: "evening" });
  });
  it("a pick task moved within one of its own days keeps all its days", () => {
    expect(dropPatch(pick(["2026-09-24", "2026-09-26"]), "2026-09-26", "morning")).toEqual({ time_section: "morning" });
  });
  it("a multi-day task dropped on a day OUTSIDE its set becomes a one-day task there", () => {
    expect(dropPatch(window_("2026-09-24", "2026-09-28"), "2026-10-01", "midday")).toEqual({
      ...onDayPatch("2026-10-01"),
      time_section: "midday",
    });
  });
  it("an overdue window dragged onto today comes back as a task for today", () => {
    const expired = window_("2026-09-18", "2026-09-22");
    expect(dropPatch(expired, TODAY, "afternoon")).toEqual({ ...onDayPatch(TODAY), time_section: "afternoon" });
  });
  it("a fixed task moves to the dropped day and section, as before", () => {
    expect(dropPatch(fixed("2026-09-24"), "2026-09-25", "evening")).toEqual({
      ...onDayPatch("2026-09-25"),
      time_section: "evening",
    });
  });
  it("never touches the deadline of a task that keeps its days", () => {
    const patch = dropPatch(window_("2026-09-24", "2026-09-28"), "2026-09-24", "night");
    expect("due_date" in patch).toBe(false);
  });
});

describe("skipDayPatch — Skip for the day, on the day it was shown", () => {
  it("a fixed task moves to the next day", () => {
    expect(skipDayPatch(fixed("2026-09-24"), "2026-09-24")).toEqual({ due_date: "2026-09-25" });
  });
  it("a fixed task viewed on another day moves to the day AFTER that one, not to tomorrow", () => {
    expect(skipDayPatch(fixed("2026-09-26"), "2026-09-26")).toEqual({ due_date: "2026-09-27" });
  });
  it("a window drops the skipped day and keeps the rest of its range", () => {
    expect(skipDayPatch(window_("2026-09-24", "2026-09-28"), "2026-09-24")).toEqual({ window_start: "2026-09-25" });
  });
  it("skipping a window's LAST day carries it to the next day", () => {
    expect(skipDayPatch(window_("2026-09-24", "2026-09-26"), "2026-09-26")).toEqual({
      window_start: "2026-09-27",
      window_end: "2026-09-27",
      due_date: "2026-09-27",
    });
  });
  it("a pick task drops just the skipped day", () => {
    expect(skipDayPatch(pick(["2026-09-24", "2026-09-26"], ["2026-09-24"]), "2026-09-24")).toEqual({
      candidate_dates: ["2026-09-26"],
      completed_dates: [],
      due_date: "2026-09-26",
    });
  });
  it("skipping a pick task's last remaining day carries it to the next day", () => {
    expect(skipDayPatch(pick(["2026-09-22", "2026-09-24"]), "2026-09-24")).toEqual({
      candidate_dates: ["2026-09-22", "2026-09-25"],
      completed_dates: [],
      due_date: "2026-09-25",
    });
  });
  it("only a fixed task already on the next day has nothing to skip to", () => {
    expect(skipIsPointless(fixed("2026-09-25"), "2026-09-24")).toBe(true);
    expect(skipIsPointless(fixed("2026-09-24"), "2026-09-24")).toBe(false);
    // A window ending tomorrow still has TODAY to drop. It used to be refused
    // with "Already on tomorrow" while sitting right there on today.
    expect(skipIsPointless(window_("2026-09-24", "2026-09-25"), "2026-09-24")).toBe(false);
  });
});

// ── Ticking off a pick task ─────────────────────────────────────────────────
describe("completeDayPatch — a pick task always has a way to finish", () => {
  const NOW = "2026-09-24T18:00:00.000Z";

  it("ticking one day of several leaves the task open", () => {
    expect(completeDayPatch(pick(["2026-09-24", "2026-09-26"]), "2026-09-24", TODAY, NOW)).toEqual({
      completed_dates: ["2026-09-24"],
    });
  });

  it("ticking the last day closes it", () => {
    expect(
      completeDayPatch(pick(["2026-09-24", "2026-09-26"], ["2026-09-24"]), "2026-09-26", "2026-09-26", NOW),
    ).toEqual({ completed_dates: ["2026-09-24", "2026-09-26"], status: "completed", completed_at: NOW });
  });

  // The stuck-forever bug: a missed day must not keep the task open for ever.
  it("a MISSED earlier day does not stop the task closing when nothing is left", () => {
    expect(completeDayPatch(pick(["2026-09-22", "2026-09-24"]), "2026-09-24", TODAY, NOW)).toEqual({
      completed_dates: ["2026-09-24"],
      status: "completed",
      completed_at: NOW,
    });
  });

  it("ticking an OVERDUE pick task (shown on a day it was not set for) finishes it", () => {
    expect(completeDayPatch(pick(["2026-09-20", "2026-09-22"]), TODAY, TODAY, NOW)).toEqual({
      completed_dates: [],
      status: "completed",
      completed_at: NOW,
    });
  });

  it("ticking a day while a later day is still unticked keeps it open", () => {
    expect(completeDayPatch(pick(["2026-09-22", "2026-09-24", "2026-09-29"]), "2026-09-24", TODAY, NOW)).toEqual({
      completed_dates: ["2026-09-24"],
    });
  });
});

describe("reopenPatch — reopening really reopens", () => {
  it("a reopened pick task has every day unticked", () => {
    expect(reopenPatch(pick(["2026-09-24", "2026-09-26"], ["2026-09-24", "2026-09-26"]))).toEqual({
      status: "open",
      completed_at: null,
      completed_dates: [],
    });
  });
  it("other shapes just reopen", () => {
    expect(reopenPatch(fixed(TODAY))).toEqual({ status: "open", completed_at: null });
  });
});

describe("reconcileOnEdit — changing a pick task's days keeps its ticks honest", () => {
  const NOW = "2026-09-24T18:00:00.000Z";
  const before = pick(["2026-09-21", "2026-09-23", "2026-09-25"], ["2026-09-21"]);
  const asPick = (dates: string[]) => ({ window_start: null, window_end: null, candidate_dates: dates });

  it("ticks for days no longer chosen are dropped", () => {
    expect(reconcileOnEdit(before, asPick(["2026-09-23", "2026-09-25", "2026-09-28"]), NOW)).toEqual({
      completed_dates: [],
    });
  });

  it("removing the only unticked day finishes the task", () => {
    const ticked = pick(["2026-09-21", "2026-09-23", "2026-09-25"], ["2026-09-21", "2026-09-23"]);
    expect(reconcileOnEdit(ticked, asPick(["2026-09-21", "2026-09-23"]), NOW)).toEqual({
      completed_dates: ["2026-09-21", "2026-09-23"],
      status: "completed",
      completed_at: NOW,
    });
  });

  it("adding a day to a finished pick task reopens it", () => {
    const done = { ...pick(["2026-09-21"], ["2026-09-21"]), status: "completed" };
    expect(reconcileOnEdit(done, asPick(["2026-09-21", "2026-09-28"]), NOW)).toEqual({
      completed_dates: ["2026-09-21"],
      status: "open",
      completed_at: null,
    });
  });

  it("switching away from pick clears the per-day ticks", () => {
    expect(
      reconcileOnEdit(before, { window_start: "2026-09-24", window_end: "2026-09-28", candidate_dates: null }, NOW),
    ).toEqual({ completed_dates: null });
  });
});

describe("dayDropPatch — dropping a task onto a day box", () => {
  it("a multi-day task dropped on a day it already covers is left alone", () => {
    // A sloppy drag that lands back in its own box must not turn a window into
    // a one-day task.
    expect(dayDropPatch(window_("2026-09-24", "2026-09-28"), "2026-09-26")).toBeNull();
    expect(dayDropPatch(pick(["2026-09-24", "2026-09-26"]), "2026-09-26")).toBeNull();
  });
  it("dropped on a day outside its set, it becomes a one-day task there", () => {
    expect(dayDropPatch(window_("2026-09-24", "2026-09-28"), "2026-10-01")).toEqual(onDayPatch("2026-10-01"));
  });
  it("a fixed task moves to the dropped day", () => {
    expect(dayDropPatch(fixed("2026-09-24"), "2026-09-25")).toEqual(onDayPatch("2026-09-25"));
  });
});
