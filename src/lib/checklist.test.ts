import { describe, expect, it } from "vitest";
import {
  allItemsDone,
  checklistProgress,
  cleanChecklistTitles,
  nextSortOrder,
  progressLabel,
  reorderChecklist,
  sortItems,
  weeklyChecklistProgress,
  weeklyItemDoneOn,
} from "./checklist";

const item = (id: string, sort_order: number, completed = false) => ({ id, title: id, sort_order, completed });

describe("checklist progress — the parent shows ONE row with a count", () => {
  it("counts done over total for a regular task", () => {
    const items = [item("a", 0, true), item("b", 1, true), item("c", 2), item("d", 3), item("e", 4)];
    expect(checklistProgress(items)).toEqual({ done: 2, total: 5 });
    expect(progressLabel(checklistProgress(items))).toBe("2/5");
  });

  it("a task with no checklist shows no count at all", () => {
    expect(progressLabel(checklistProgress([]))).toBeNull();
    expect(progressLabel(null)).toBeNull();
  });

  it("allItemsDone is the ask-first moment: every item ticked, and at least one item", () => {
    expect(allItemsDone({ done: 3, total: 3 })).toBe(true);
    expect(allItemsDone({ done: 2, total: 3 })).toBe(false);
    expect(allItemsDone({ done: 0, total: 0 })).toBe(false);
  });
});

describe("weekly checklists — same items every time, fresh boxes each occurrence", () => {
  const items = [item("walk", 0), item("water", 1), item("feed", 2)];
  const checks = [
    { checklist_item_id: "walk", date: "2026-10-05", completed: true },
    { checklist_item_id: "water", date: "2026-10-05", completed: true },
    { checklist_item_id: "feed", date: "2026-10-05", completed: true },
    { checklist_item_id: "walk", date: "2026-10-06", completed: true },
  ];

  it("Monday fully ticked does not carry into Tuesday", () => {
    expect(weeklyChecklistProgress(items, checks, "2026-10-05")).toEqual({ done: 3, total: 3 });
    expect(weeklyChecklistProgress(items, checks, "2026-10-06")).toEqual({ done: 1, total: 3 });
    expect(weeklyChecklistProgress(items, checks, "2026-10-07")).toEqual({ done: 0, total: 3 });
  });

  it("an un-ticked row (completed=false) counts as not done", () => {
    const c = [{ checklist_item_id: "walk", date: "2026-10-08", completed: false }];
    expect(weeklyItemDoneOn("walk", c, "2026-10-08")).toBe(false);
  });

  it("the item's own completed flag is ignored for weekly occurrences — only the date row counts", () => {
    const stale = [item("walk", 0, true)];
    expect(weeklyChecklistProgress(stale, [], "2026-10-08")).toEqual({ done: 0, total: 1 });
  });
});

describe("ordering items", () => {
  it("sorts by sort_order without mutating the input", () => {
    const items = [item("c", 2), item("a", 0), item("b", 1)];
    expect(sortItems(items).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(items[0].id).toBe("c");
  });

  it("appends after the current highest sort_order", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([item("a", 0), item("b", 4)])).toBe(5);
  });

  it("moving an item renumbers the whole list densely", () => {
    const items = [item("a", 0), item("b", 5), item("c", 9)];
    expect(reorderChecklist(items, 2, -1)).toEqual([
      { id: "a", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("refuses to move off either end", () => {
    const items = [item("a", 0), item("b", 1)];
    expect(reorderChecklist(items, 0, -1)).toEqual([]);
    expect(reorderChecklist(items, 1, 1)).toEqual([]);
  });
});

describe("cleanChecklistTitles — what a voice split hands over", () => {
  it("trims, drops blanks and exact duplicates, keeps order", () => {
    expect(
      cleanChecklistTitles([" Charlie's portion ", "", "Keenan's portion", "charlie's portion", "Vesper's portion"]),
    ).toEqual(["Charlie's portion", "Keenan's portion", "Vesper's portion"]);
  });
});
