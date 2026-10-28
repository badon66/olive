import { describe, expect, it } from "vitest";
import { minutesLeftInSection, nextSection, sectionBounds, sectionStartLabel, timeLeftLabel } from "./sections";

describe("section timing — the phone's current-part card", () => {
  it("bounds follow the resolved clock ranges, Morning wake-relative, Night wrapped past midnight", () => {
    expect(sectionBounds("midday")).toEqual({ start: 12 * 60, end: 16 * 60 });
    expect(sectionBounds("morning", "07:30")).toEqual({ start: 450, end: 720 });
    expect(sectionBounds("night")).toEqual({ start: 23 * 60, end: 29 * 60 });
    expect(sectionBounds("anytime")).toBeNull();
  });

  it("minutes left count to the section's end, including Night in the small hours", () => {
    expect(minutesLeftInSection("midday", 13 * 60 + 45)).toBe(135);
    expect(minutesLeftInSection("night", 2 * 60)).toBe(180);
    expect(minutesLeftInSection("night", 23 * 60 + 30)).toBe(330);
    expect(minutesLeftInSection("afternoon", 19 * 60)).toBe(0);
    expect(minutesLeftInSection("anytime", 600)).toBeNull();
  });

  it("time left reads in plain words", () => {
    expect(timeLeftLabel(135)).toBe("2h 15m left");
    expect(timeLeftLabel(120)).toBe("2h left");
    expect(timeLeftLabel(45)).toBe("45m left");
    expect(timeLeftLabel(0)).toBe("ending now");
    expect(timeLeftLabel(null)).toBeNull();
  });

  it("the next section follows the clock, and Night is the day's last", () => {
    expect(nextSection("morning")).toBe("midday");
    expect(nextSection("evening")).toBe("night");
    expect(nextSection("night")).toBeNull();
    expect(nextSection("anytime")).toBeNull();
  });

  it("start labels are 12-hour", () => {
    expect(sectionStartLabel("night")).toBe("11 PM");
    expect(sectionStartLabel("midday")).toBe("12 PM");
    expect(sectionStartLabel("morning", "07:30")).toBe("7:30 AM");
    expect(sectionStartLabel("anytime")).toBeNull();
  });
});
