import { describe, expect, it } from "vitest";
import { scheduleSort, upcomingDates } from "./sections";

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
