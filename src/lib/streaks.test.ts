import { describe, expect, it } from "vitest";
import { dailyStreak, last7Days, mondayOf, weeklyStreak } from "./streaks";

describe("mondayOf", () => {
  it("maps any weekday to that week's Monday", () => {
    expect(mondayOf("2026-07-07")).toBe("2026-07-06"); // Tue → Mon
    expect(mondayOf("2026-07-06")).toBe("2026-07-06"); // Mon → itself
    expect(mondayOf("2026-07-12")).toBe("2026-07-06"); // Sun → previous Mon
  });
  it("crosses month and year boundaries", () => {
    expect(mondayOf("2026-01-01")).toBe("2025-12-29"); // Thu Jan 1 → Mon Dec 29
  });
});

describe("dailyStreak", () => {
  const TODAY = "2026-07-07";
  it("counts consecutive days ending today", () => {
    expect(dailyStreak(new Set(["2026-07-05", "2026-07-06", "2026-07-07"]), TODAY)).toBe(3);
  });
  it("unchecked today doesn't break a streak (grace until day ends)", () => {
    expect(dailyStreak(new Set(["2026-07-05", "2026-07-06"]), TODAY)).toBe(2);
  });
  it("a gap before yesterday breaks it", () => {
    expect(dailyStreak(new Set(["2026-07-04", "2026-07-06"]), TODAY)).toBe(1);
  });
  it("zero when neither today nor yesterday checked", () => {
    expect(dailyStreak(new Set(["2026-07-04"]), TODAY)).toBe(0);
  });
  it("survives month boundaries", () => {
    expect(dailyStreak(new Set(["2026-06-29", "2026-06-30", "2026-07-01"]), "2026-07-01")).toBe(3);
  });
});

describe("weeklyStreak", () => {
  const TODAY = "2026-07-07"; // Tue of week starting Mon 2026-07-06
  it("counts consecutive weeks ending this week", () => {
    expect(weeklyStreak(["2026-06-24", "2026-07-01", "2026-07-07"], TODAY)).toBe(3);
  });
  it("unchecked current week doesn't break (grace until week ends)", () => {
    expect(weeklyStreak(["2026-06-24", "2026-07-01"], TODAY)).toBe(2);
  });
  it("a skipped week breaks it", () => {
    expect(weeklyStreak(["2026-06-17", "2026-07-01"], TODAY)).toBe(1);
  });
  it("zero when neither this week nor last week checked", () => {
    expect(weeklyStreak(["2026-06-17"], TODAY)).toBe(0);
  });
  it("multiple check-ins in one week count once", () => {
    expect(weeklyStreak(["2026-07-06", "2026-07-07", "2026-07-01"], TODAY)).toBe(2);
  });
  it("survives year boundaries", () => {
    // weeks: Mon 2025-12-22, Mon 2025-12-29, Mon 2026-01-05
    expect(weeklyStreak(["2025-12-23", "2025-12-31", "2026-01-06"], "2026-01-06")).toBe(3);
  });
});

describe("last7Days", () => {
  it("returns 7 dates oldest-first ending today", () => {
    const days = last7Days("2026-07-07");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-07-01");
    expect(days[6]).toBe("2026-07-07");
  });
  it("crosses month boundaries", () => {
    expect(last7Days("2026-08-02")[0]).toBe("2026-07-27");
  });
});
