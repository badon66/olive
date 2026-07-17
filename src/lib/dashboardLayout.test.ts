import { describe, expect, it } from "vitest";
import { catKey, defaultLayout, mergeLayout } from "./dashboardLayout";

const CATS = ["aaa", "bbb", "ccc"];

describe("defaultLayout", () => {
  it("encodes the two-column split: weekly/categories/finance left, schedule/upcoming/jobs/journal right", () => {
    const l = defaultLayout(CATS);
    for (const key of ["weekly", catKey("aaa"), catKey("bbb"), catKey("ccc"), "finance"]) {
      expect(l[key].x).toBe(0);
      expect(l[key].w).toBe(6);
    }
    for (const key of ["schedule", "upcoming", "jobs", "journal"]) {
      expect(l[key].x).toBe(6);
      expect(l[key].w).toBe(6);
    }
  });
  it("puts priorities full-width below everything", () => {
    const l = defaultLayout(CATS);
    expect(l.priorities).toMatchObject({ x: 0, w: 12 });
    const maxOtherY = Math.max(...Object.entries(l).filter(([k]) => k !== "priorities").map(([, s]) => s.y));
    expect(l.priorities.y).toBeGreaterThan(maxOtherY);
  });
});

describe("mergeLayout", () => {
  it("saved positions and labels win over defaults", () => {
    const merged = mergeLayout({ weekly: { x: 6, y: 0, w: 6, label: "Routines" } }, CATS);
    expect(merged.weekly).toMatchObject({ x: 6, w: 6, label: "Routines" });
  });
  it("categories created after the save get their default slot", () => {
    const merged = mergeLayout({ weekly: { x: 6, y: 0, w: 6 } }, [...CATS, "new-cat"]);
    expect(merged[catKey("new-cat")]).toMatchObject({ x: 0, w: 6 });
  });
  it("keys for deleted categories are dropped", () => {
    const merged = mergeLayout({ [catKey("gone")]: { x: 0, y: 0, w: 6 } }, CATS);
    expect(merged[catKey("gone")]).toBeUndefined();
  });
});
