import { describe, expect, it } from "vitest";
import { carryoverTasks, isLateBedtime } from "./dayrules";

describe("isLateBedtime — later than 11:00 PM", () => {
  it("is false when no bedtime was given", () => {
    expect(isLateBedtime(null)).toBe(false);
    expect(isLateBedtime(undefined)).toBe(false);
    expect(isLateBedtime("")).toBe(false);
  });
  it("11:00 PM exactly is not 'later than'", () => {
    expect(isLateBedtime("23:00")).toBe(false);
    expect(isLateBedtime("23:00:00")).toBe(false); // Postgres time column format
  });
  it("after 11 PM is late", () => {
    expect(isLateBedtime("23:01")).toBe(true);
    expect(isLateBedtime("23:30:00")).toBe(true);
  });
  it("small hours count as late — they're the same night", () => {
    expect(isLateBedtime("00:00")).toBe(true);
    expect(isLateBedtime("01:30")).toBe(true);
    expect(isLateBedtime("04:59")).toBe(true);
  });
  it("5 AM and normal evenings are not late", () => {
    expect(isLateBedtime("05:00")).toBe(false);
    expect(isLateBedtime("22:00")).toBe(false);
    expect(isLateBedtime("09:00")).toBe(false);
  });
});

// Carryover is MANUAL: an opted-in overdue task stays on its original date and
// sits in the dropdown until the user drags it or edits its date.
describe("carryoverTasks", () => {
  const t = (over: Partial<{ id: string; due_date: string | null; auto_carry_forward: boolean }>) => ({
    id: over.id ?? "x",
    due_date: over.due_date ?? null,
    auto_carry_forward: over.auto_carry_forward ?? false,
  });
  const TODAY = "2026-07-28";

  it("includes an opted-in task sitting overdue on its ORIGINAL date", () => {
    const rows = [t({ id: "b", due_date: "2026-07-27", auto_carry_forward: true })];
    expect(carryoverTasks(rows, TODAY).map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps it on its original date — nothing bumps due_date forward", () => {
    const rows = [t({ id: "b", due_date: "2026-07-20", auto_carry_forward: true })];
    const [out] = carryoverTasks(rows, TODAY);
    expect(out.due_date).toBe("2026-07-20");
  });

  it("stays in the list on every following day until acted on", () => {
    const rows = [t({ id: "b", due_date: "2026-07-25", auto_carry_forward: true })];
    for (const day of ["2026-07-26", "2026-07-27", TODAY, "2026-08-05"]) {
      expect(carryoverTasks(rows, day).map((r) => r.id)).toEqual(["b"]);
    }
  });

  it("leaves the list once the user reschedules it onto today or later", () => {
    // Dragging onto a day, or editing the date, just rewrites due_date.
    expect(carryoverTasks([t({ id: "b", due_date: TODAY, auto_carry_forward: true })], TODAY)).toEqual([]);
    expect(carryoverTasks([t({ id: "b", due_date: "2026-08-01", auto_carry_forward: true })], TODAY)).toEqual([]);
  });

  it("excludes plain overdue tasks that never opted in", () => {
    const rows = [t({ id: "c", due_date: "2026-07-27", auto_carry_forward: false })];
    expect(carryoverTasks(rows, TODAY)).toEqual([]);
  });

  it("excludes unscheduled opted-in tasks — no due date means not overdue", () => {
    const rows = [t({ id: "d", due_date: null, auto_carry_forward: true })];
    expect(carryoverTasks(rows, TODAY)).toEqual([]);
  });

  it("does not surface a task whose flag was later switched off", () => {
    const rows = [t({ id: "f", due_date: "2026-07-01", auto_carry_forward: false })];
    expect(carryoverTasks(rows, TODAY)).toEqual([]);
  });
});
