import { describe, expect, it } from "vitest";
import { daysBetween, edmontonToday, formatDue } from "./dates";

describe("edmontonToday — 1:30 AM day boundary", () => {
  // July → MDT (UTC-6)
  it("1:00 AM local still counts as the previous day", () => {
    expect(edmontonToday(new Date("2026-07-08T07:00:00Z"))).toBe("2026-07-07"); // 01:00 local Jul 8
  });
  it("1:29 AM local is still the previous day", () => {
    expect(edmontonToday(new Date("2026-07-08T07:29:00Z"))).toBe("2026-07-07");
  });
  it("1:30 AM local flips to the new day", () => {
    expect(edmontonToday(new Date("2026-07-08T07:30:00Z"))).toBe("2026-07-08");
  });
  it("2 AM local is the new day", () => {
    expect(edmontonToday(new Date("2026-07-08T08:00:00Z"))).toBe("2026-07-08");
  });
  it("midnight is still the previous day", () => {
    expect(edmontonToday(new Date("2026-07-08T06:00:00Z"))).toBe("2026-07-07"); // 00:00 local Jul 8
  });
  it("late evening is the same calendar day", () => {
    expect(edmontonToday(new Date("2026-07-08T05:00:00Z"))).toBe("2026-07-07"); // 23:00 local Jul 7
  });
  it("holds across a month boundary at 1 AM", () => {
    expect(edmontonToday(new Date("2026-08-01T07:00:00Z"))).toBe("2026-07-31"); // 01:00 local Aug 1
  });
});

describe("edmontonToday", () => {
  it("converts UTC evening to same Edmonton date in summer (MDT, UTC-6)", () => {
    expect(edmontonToday(new Date("2026-07-07T13:00:00Z"))).toBe("2026-07-07");
  });
  it("rolls back a date when UTC is past midnight but Edmonton is not", () => {
    expect(edmontonToday(new Date("2026-07-08T03:00:00Z"))).toBe("2026-07-07");
  });
  it("handles winter (MST, UTC-7)", () => {
    expect(edmontonToday(new Date("2026-01-15T06:59:00Z"))).toBe("2026-01-14");
  });
});

describe("daysBetween", () => {
  it("is positive for future dates", () => expect(daysBetween("2026-07-07", "2026-07-10")).toBe(3));
  it("is negative for past dates", () => expect(daysBetween("2026-07-07", "2026-07-05")).toBe(-2));
  it("is zero for same day", () => expect(daysBetween("2026-07-07", "2026-07-07")).toBe(0));
  it("crosses month boundaries", () => expect(daysBetween("2026-07-30", "2026-08-02")).toBe(3));
});

describe("formatDue", () => {
  it("Today / Tomorrow / overdue / date", () => {
    expect(formatDue("2026-07-07", "2026-07-07")).toBe("Today");
    expect(formatDue("2026-07-08", "2026-07-07")).toBe("Tomorrow");
    expect(formatDue("2026-07-04", "2026-07-07")).toBe("3d overdue");
    expect(formatDue("2026-07-12", "2026-07-07")).toBe("Jul 12");
  });
});
