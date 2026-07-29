import { describe, expect, it } from "vitest";
import { partitionSchedule, scheduleSort, sectionClockLabel, upcomingDates } from "./sections";

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

describe("partitionSchedule — Night bookends the ribbon", () => {
  const task = (id: string, due_date: string | null, time_section: string | null) =>
    ({ id, due_date, time_section }) as { id: string; due_date: string | null; time_section: never };

  it("routes a night task due before today to the leading (earlier) slot", () => {
    const out = partitionSchedule([task("a", "2026-07-06", "night")], "2026-07-07");
    expect(out["night-earlier"].map((t) => t.id)).toEqual(["a"]);
    expect(out["night-ahead"]).toEqual([]);
  });

  it("routes a night task due today to the trailing (tonight) slot", () => {
    const out = partitionSchedule([task("b", "2026-07-07", "night")], "2026-07-07");
    expect(out["night-ahead"].map((t) => t.id)).toEqual(["b"]);
    expect(out["night-earlier"]).toEqual([]);
  });

  it("keeps the same night task out of both ends — never duplicated", () => {
    const out = partitionSchedule(
      [task("a", "2026-07-06", "night"), task("b", "2026-07-07", "night")],
      "2026-07-07",
    );
    expect(out["night-earlier"].map((t) => t.id)).toEqual(["a"]);
    expect(out["night-ahead"].map((t) => t.id)).toEqual(["b"]);
  });

  it("drops each daytime task into its own section, overdue included", () => {
    const out = partitionSchedule(
      [task("m", "2026-07-04", "morning"), task("e", "2026-07-07", "evening")],
      "2026-07-07",
    );
    expect(out.morning.map((t) => t.id)).toEqual(["m"]);
    expect(out.evening.map((t) => t.id)).toEqual(["e"]);
  });

  it("treats a null time_section as anytime", () => {
    const out = partitionSchedule([task("x", "2026-07-07", null)], "2026-07-07");
    expect(out.anytime.map((t) => t.id)).toEqual(["x"]);
  });
});
