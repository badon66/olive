import { describe, expect, it } from "vitest";
import {
  nextSectionFor,
  orderBySortOrder,
  partitionSchedule,
  scheduleSort,
  sectionClockLabel,
  reorderSection,
  SCHEDULE_SLOTS,
  upcomingDates,
  type TimeSection,
} from "./sections";

describe("upcomingDates", () => {
  it("returns today plus the requested days ahead, chronological", () => {
    expect(upcomingDates("2026-07-07", 3)).toEqual([
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });
  it("expands to a full week ahead (today + 7) and crosses month boundaries", () => {
    expect(upcomingDates("2026-07-29", 7)).toEqual([
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });
});

describe("orderBySortOrder", () => {
  const t = (
    id: string,
    sort_order: number | null = null,
    scheduled_time: string | null = null,
    priority_weight = 3,
  ) => ({ id, sort_order, scheduled_time, priority_weight, created_at: "2026-08-01T00:00:00Z" });

  it("falls back to the normal schedule sort when nothing is placed", () => {
    const list = [t("a", null, null, 2), t("b", null, "14:30:00"), t("c", null, "09:00:00")];
    expect(orderBySortOrder(list).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("puts manually placed tasks first, by sort_order", () => {
    const list = [t("a", 2), t("b", 0), t("c", 1)];
    expect(orderBySortOrder(list).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("placed tasks lead, untouched ones follow in schedule order", () => {
    const list = [t("a", null, "09:00:00"), t("b", 0), t("c", null)];
    expect(orderBySortOrder(list).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("manual placement beats a booked time", () => {
    const list = [t("a", 0), t("b", 1, "09:00:00")];
    expect(orderBySortOrder(list).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("treats sort_order 0 as placed, not missing", () => {
    const list = [t("a", null, "09:00:00"), t("b", 0)];
    expect(orderBySortOrder(list)[0].id).toBe("b");
  });
});

describe("reorderSection", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moving up swaps with the previous task and renumbers the section", () => {
    expect(reorderSection(list, 2, -1)).toEqual([
      { id: "a", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("moving down swaps with the next task", () => {
    expect(reorderSection(list, 0, 1)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("renumbers every task so a never-ordered section gets a full order", () => {
    expect(reorderSection(list, 1, 1).map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it("refuses to move off either end", () => {
    expect(reorderSection(list, 0, -1)).toEqual([]);
    expect(reorderSection(list, 2, 1)).toEqual([]);
  });

  it("is a no-op for a single-task section", () => {
    expect(reorderSection([{ id: "solo" }], 0, -1)).toEqual([]);
    expect(reorderSection([{ id: "solo" }], 0, 1)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const original = [{ id: "a" }, { id: "b" }];
    reorderSection(original, 0, 1);
    expect(original.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("sectionClockLabel — resolved boundaries", () => {
  it("Morning is wake-relative to noon", () => {
    expect(sectionClockLabel("morning", "09:00")).toBe("9:00 AM – 12:00 PM");
    expect(sectionClockLabel("morning", "11:00")).toBe("11:00 AM – 12:00 PM");
    expect(sectionClockLabel("morning", "07:30")).toBe("7:30 AM – 12:00 PM");
  });
  it("defaults Morning wake to 11:00 and ignores seconds", () => {
    expect(sectionClockLabel("morning")).toBe("11:00 AM – 12:00 PM");
    expect(sectionClockLabel("morning", "09:00:00")).toBe("9:00 AM – 12:00 PM");
  });
  it("fixed windows for the rest, Night wraps midnight", () => {
    expect(sectionClockLabel("midday")).toBe("12:00 PM – 4:00 PM");
    expect(sectionClockLabel("afternoon")).toBe("4:00 PM – 6:00 PM");
    expect(sectionClockLabel("evening")).toBe("6:00 PM – 11:00 PM");
    expect(sectionClockLabel("night")).toBe("11:00 PM – 5:00 AM");
  });
  it("anytime has no window", () => {
    expect(sectionClockLabel("anytime")).toBeNull();
  });
});

describe("scheduleSort", () => {
  const t = (scheduled_time: string | null, priority_weight = 3, created_at = "2026-07-01T00:00:00Z") => ({
    scheduled_time,
    priority_weight,
    created_at,
  });
  it("orders timed bookings first, by time ascending", () => {
    const list = [t(null, 5), t("14:30:00"), t("09:00:00")].sort(scheduleSort);
    expect(list.map((x) => x.scheduled_time)).toEqual(["09:00:00", "14:30:00", null]);
  });
  it("falls back to priority desc then created_at asc for untimed tasks", () => {
    const a = t(null, 2, "2026-07-01T00:00:00Z");
    const b = t(null, 5, "2026-07-02T00:00:00Z");
    const c = t(null, 5, "2026-07-01T00:00:00Z");
    expect([a, b, c].sort(scheduleSort)).toEqual([c, b, a]);
  });
});

describe("partitionSchedule — one slot per section, Night appears once", () => {
  const task = (id: string, time_section: string | null) =>
    ({ id, time_section }) as { id: string; time_section: never };

  it("puts every night task in the single Night slot", () => {
    const out = partitionSchedule([task("a", "night"), task("b", "night")]);
    expect(out.night.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("has no leading 'earlier night' slot any more", () => {
    const out = partitionSchedule([task("a", "night")]);
    expect(out["night-earlier"]).toBeUndefined();
    expect(out["night-ahead"]).toBeUndefined();
    expect(Object.keys(out)).toEqual(["morning", "midday", "afternoon", "evening", "night", "anytime"]);
  });

  it("drops each daytime task into its own section", () => {
    const out = partitionSchedule([task("m", "morning"), task("e", "evening")]);
    expect(out.morning.map((t) => t.id)).toEqual(["m"]);
    expect(out.evening.map((t) => t.id)).toEqual(["e"]);
  });

  it("treats a null time_section as anytime", () => {
    const out = partitionSchedule([task("x", null)]);
    expect(out.anytime.map((t) => t.id)).toEqual(["x"]);
  });

  it("places every task exactly once", () => {
    const all = [task("a", "morning"), task("b", "night"), task("c", null), task("d", "midday")];
    const out = partitionSchedule(all);
    expect(Object.values(out).flat()).toHaveLength(4);
  });
});

describe("SCHEDULE_SLOTS — plain chronological sequence", () => {
  it("is Morning → Midday → Afternoon → Evening → Night, then Anytime", () => {
    expect(SCHEDULE_SLOTS.map((s) => s.key)).toEqual([
      "morning",
      "midday",
      "afternoon",
      "evening",
      "night",
      "anytime",
    ]);
  });
  it("every slot is a drop target now the read-only night slot is gone", () => {
    expect(SCHEDULE_SLOTS.every((s) => s.droppable)).toBe(true);
  });
});

// Arrows at the edge of a section carry the task across the boundary.
describe("nextSectionFor — crossing time_section boundaries", () => {
  const occ = (...s: TimeSection[]) => new Set<TimeSection>(s);

  it("pressing down on the last Evening task moves it into Night", () => {
    expect(nextSectionFor("evening", 1, occ("evening", "night"))).toEqual({ section: "night", atEnd: false });
  });

  it("pressing up on the first Midday task moves it into Morning", () => {
    expect(nextSectionFor("midday", -1, occ("morning", "midday"))).toEqual({ section: "morning", atEnd: true });
  });

  it("jumps straight over a completely empty adjacent section", () => {
    // Morning occupied, Midday EMPTY, Afternoon occupied — one press clears Midday
    expect(nextSectionFor("morning", 1, occ("morning", "afternoon"))).toEqual({
      section: "afternoon",
      atEnd: false,
    });
  });

  it("skips several empty sections in one press", () => {
    expect(nextSectionFor("morning", 1, occ("morning", "night"))).toEqual({ section: "night", atEnd: false });
  });

  it("still lands in the immediate neighbour when nothing ahead is occupied", () => {
    // Never a no-op just because the rest of the day is empty
    expect(nextSectionFor("morning", 1, occ("morning"))).toEqual({ section: "midday", atEnd: false });
  });

  it("stops at the ends of the day", () => {
    expect(nextSectionFor("morning", -1, occ("morning"))).toBeNull();
    expect(nextSectionFor("night", 1, occ("night"))).toBeNull();
  });

  it("never moves a task into or out of Anytime", () => {
    expect(nextSectionFor("anytime", -1, occ("anytime", "morning"))).toBeNull();
    expect(nextSectionFor("anytime", 1, occ("anytime", "night"))).toBeNull();
    // and Night's downward move doesn't fall through into Anytime
    expect(nextSectionFor("night", 1, occ("night", "anytime"))).toBeNull();
  });
});
