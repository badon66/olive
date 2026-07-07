import { describe, expect, it } from "vitest";
import { scoreTask, suggestedOrder } from "./ranking";

const t = (id: string, due: string | null, w = 3, created = "2026-07-01T00:00:00Z") => ({
  id,
  due_date: due,
  priority_weight: w,
  created_at: created,
});
const TODAY = "2026-07-07";

describe("scoreTask", () => {
  it("overdue beats due-today; due-today beats future; future beats undated", () => {
    const overdue = scoreTask(t("a", "2026-07-05"), TODAY);
    const today = scoreTask(t("b", "2026-07-07"), TODAY);
    const future = scoreTask(t("c", "2026-07-09"), TODAY);
    const undated = scoreTask(t("d", null), TODAY);
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(future);
    expect(future).toBeGreaterThan(undated);
  });
  it("priority breaks ties within a band", () => {
    expect(scoreTask(t("a", "2026-07-07", 5), TODAY)).toBeGreaterThan(
      scoreTask(t("b", "2026-07-07", 1), TODAY),
    );
  });
  it("nearer future dates score higher", () => {
    expect(scoreTask(t("a", "2026-07-08"), TODAY)).toBeGreaterThan(
      scoreTask(t("b", "2026-07-12"), TODAY),
    );
  });
  it("priority can never promote a task across bands", () => {
    expect(scoreTask(t("a", "2026-07-07", 1), TODAY)).toBeGreaterThan(
      scoreTask(t("b", "2026-07-08", 5), TODAY),
    );
  });
});

describe("suggestedOrder", () => {
  it("orders by score desc, created_at asc as tiebreak", () => {
    const list = [
      t("future", "2026-07-10"),
      t("overdue", "2026-07-01"),
      t("today-hi", "2026-07-07", 5),
      t("today-lo", "2026-07-07", 2),
    ];
    expect(suggestedOrder(list, TODAY)).toEqual(["overdue", "today-hi", "today-lo", "future"]);
  });
  it("breaks exact ties by creation time, oldest first", () => {
    const list = [
      t("newer", null, 3, "2026-07-06T00:00:00Z"),
      t("older", null, 3, "2026-07-02T00:00:00Z"),
    ];
    expect(suggestedOrder(list, TODAY)).toEqual(["older", "newer"]);
  });
});
