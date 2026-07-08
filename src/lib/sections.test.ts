import { describe, expect, it } from "vitest";
import { dayBlockDates, scheduleSort } from "./sections";

describe("dayBlockDates", () => {
  it("returns the next 7 days (tomorrow onward) ordered Monday-first", () => {
    // 2026-07-07 is a Tuesday → next 7 days are Wed Jul 8 … Tue Jul 14
    expect(dayBlockDates("2026-07-07")).toEqual([
      "2026-07-13", // Mon
      "2026-07-14", // Tue
      "2026-07-08", // Wed
      "2026-07-09", // Thu
      "2026-07-10", // Fri
      "2026-07-11", // Sat
      "2026-07-12", // Sun
    ]);
  });
  it("starts with tomorrow when today is Sunday", () => {
    // 2026-07-12 is a Sunday → next 7 days are Mon Jul 13 … Sun Jul 19, already Mon-first
    expect(dayBlockDates("2026-07-12")).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
    ]);
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
