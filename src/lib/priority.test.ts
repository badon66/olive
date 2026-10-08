import { describe, expect, it } from "vitest";
import { clampPriority, DEFAULT_PRIORITY, MAX_PRIORITY, PRIORITY_LEVELS, priorityDescription, priorityLabel } from "./priority";

describe("priority — three fixed levels, 3 = most important", () => {
  it("has exactly three levels, each with a meaning shown in pickers", () => {
    expect(PRIORITY_LEVELS.map((l) => l.value)).toEqual([1, 2, 3]);
    expect(PRIORITY_LEVELS.map((l) => l.label)).toEqual(["Low", "Medium", "Urgent"]);
    for (const l of PRIORITY_LEVELS) expect(l.meaning.length).toBeGreaterThan(0);
    expect(MAX_PRIORITY).toBe(3);
  });

  it("defaults to medium, which is what the old middle level (3 of 5) became", () => {
    expect(DEFAULT_PRIORITY).toBe(2);
  });

  it("clamps stray legacy values the same way the migration mapped them at the top end", () => {
    expect(clampPriority(4)).toBe(3);
    expect(clampPriority(5)).toBe(3);
    expect(clampPriority(3)).toBe(3);
    expect(clampPriority(2)).toBe(2);
    expect(clampPriority(1)).toBe(1);
    expect(clampPriority(0)).toBe(1);
    expect(clampPriority(undefined)).toBe(DEFAULT_PRIORITY);
    expect(clampPriority(NaN)).toBe(DEFAULT_PRIORITY);
  });

  it("labels and describes each level", () => {
    expect(priorityLabel(1)).toBe("Low");
    expect(priorityLabel(2)).toBe("Medium");
    expect(priorityLabel(3)).toBe("Urgent");
    expect(priorityDescription(3)).toBe("Priority 3 of 3 — urgent");
  });
});
