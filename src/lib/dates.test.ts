import { describe, expect, it } from "vitest";
import {
  daysBetween,
  edmontonActiveDay,
  edmontonToday,
  formatCountdown,
  formatDue,
  fullDateLabel,
  secondsUntilRollover,
  weekRangeLabel,
} from "./dates";

// July → MDT (UTC-6), so local = UTC-6. The night of Jul 7 → Jul 8 throughout.
const at = (localHHMM: string) => new Date(`2026-07-08T${localHHMM}:00Z`);
const LOCAL = {
  elevenPM: at("05:00"), // 23:00 Jul 7
  midnight: at("06:00"), // 00:00 Jul 8
  oneAM: at("07:00"), // 01:00
  oneTwentyNine: at("07:29"), // 01:29
  oneThirty: at("07:30"), // 01:30 — VIEW flips
  twoAM: at("08:00"), // 02:00
  fourFiftyNine: at("10:59"), // 04:59
  fiveAM: at("11:00"), // 05:00 — ACTIVE flips
};

describe("edmontonToday — VIEW boundary, the page flips at 1:30 AM", () => {
  it("11 PM is the same calendar day", () => expect(edmontonToday(LOCAL.elevenPM)).toBe("2026-07-07"));
  it("midnight is still the previous day", () => expect(edmontonToday(LOCAL.midnight)).toBe("2026-07-07"));
  it("1:00 AM is still the previous day", () => expect(edmontonToday(LOCAL.oneAM)).toBe("2026-07-07"));
  it("1:29 AM is the last minute of the previous day", () =>
    expect(edmontonToday(LOCAL.oneTwentyNine)).toBe("2026-07-07"));
  it("1:30 AM sharp flips the page to the new day", () => expect(edmontonToday(LOCAL.oneThirty)).toBe("2026-07-08"));
  it("2:00 AM is the new day — the page has already flipped", () =>
    expect(edmontonToday(LOCAL.twoAM)).toBe("2026-07-08"));
  it("holds across a month boundary", () =>
    expect(edmontonToday(new Date("2026-08-01T07:00:00Z"))).toBe("2026-07-31")); // 01:00 local Aug 1
});

describe("edmontonActiveDay — ACTIVE boundary, Night runs until 5:00 AM", () => {
  it("11 PM belongs to the day the night started on", () =>
    expect(edmontonActiveDay(LOCAL.elevenPM)).toBe("2026-07-07"));
  it("midnight is still that day", () => expect(edmontonActiveDay(LOCAL.midnight)).toBe("2026-07-07"));
  it("1:00 AM is still that day", () => expect(edmontonActiveDay(LOCAL.oneAM)).toBe("2026-07-07"));
  it("2:00 AM is STILL that day, even though the page has flipped", () =>
    expect(edmontonActiveDay(LOCAL.twoAM)).toBe("2026-07-07"));
  it("4:59 AM is the last minute of that day", () =>
    expect(edmontonActiveDay(LOCAL.fourFiftyNine)).toBe("2026-07-07"));
  it("5:00 AM sharp flips to the new day", () => expect(edmontonActiveDay(LOCAL.fiveAM)).toBe("2026-07-08"));
  it("a whole night belongs to the day it started on", () => {
    for (const t of [LOCAL.elevenPM, LOCAL.midnight, LOCAL.oneAM, LOCAL.twoAM, LOCAL.fourFiftyNine]) {
      expect(edmontonActiveDay(t)).toBe("2026-07-07");
    }
  });
});

// The headline requirement from CLAUDE.md, stated as one table.
describe("the two boundaries agree except between 1:30 and 5:00 AM", () => {
  it("1:00 AM — page and active tasks BOTH show the previous day", () => {
    expect(edmontonToday(LOCAL.oneAM)).toBe("2026-07-07");
    expect(edmontonActiveDay(LOCAL.oneAM)).toBe("2026-07-07");
  });

  it("2:00 AM — page flipped to the new day, active tasks still on the previous day", () => {
    expect(edmontonToday(LOCAL.twoAM)).toBe("2026-07-08"); // page moved on
    expect(edmontonActiveDay(LOCAL.twoAM)).toBe("2026-07-07"); // night still running
    // The disagreement is the point — assert it explicitly so nobody "fixes" it.
    expect(edmontonToday(LOCAL.twoAM)).not.toBe(edmontonActiveDay(LOCAL.twoAM));
  });

  it("they agree again from 5:00 AM onward", () => {
    for (const t of [LOCAL.fiveAM, new Date("2026-07-08T20:00:00Z")]) {
      expect(edmontonToday(t)).toBe(edmontonActiveDay(t));
    }
  });

  it("they agree before 1:30 AM and through the evening", () => {
    for (const t of [LOCAL.elevenPM, LOCAL.midnight, LOCAL.oneAM, LOCAL.oneTwentyNine]) {
      expect(edmontonToday(t)).toBe(edmontonActiveDay(t));
    }
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

// The visible countdown tracks the VIEW flip (1:30), because that is the one the
// user watches happen — the schedule page turning over.
describe("secondsUntilRollover — counts down to 1:30 AM Edmonton", () => {
  it("is positive and within a day", () => {
    const s = secondsUntilRollover(new Date("2026-07-27T20:00:00Z"));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(86_400);
  });
  it("just before 1:30 AM local, only seconds remain", () => {
    // 2026-07-27T07:29:30Z = 01:29:30 local (MDT) → 30s to 1:30
    expect(secondsUntilRollover(new Date("2026-07-27T07:29:30Z"))).toBe(30);
  });
  it("just after 1:30 AM local, nearly a full day remains", () => {
    // 2026-07-27T07:30:30Z = 01:30:30 local → 24h - 30s
    expect(secondsUntilRollover(new Date("2026-07-27T07:30:30Z"))).toBe(86_400 - 30);
  });
  it("at 1:00 AM there is half an hour left", () => {
    // 2026-07-27T07:00:00Z = 01:00 local → 30m to the 1:30 flip
    expect(secondsUntilRollover(new Date("2026-07-27T07:00:00Z"))).toBe(1800);
  });
});

describe("formatCountdown", () => {
  it("formats H:MM:SS", () => {
    expect(formatCountdown(30)).toBe("0:00:30");
    expect(formatCountdown(3661)).toBe("1:01:01");
    expect(formatCountdown(86_370)).toBe("23:59:30");
  });
});

describe("fullDateLabel", () => {
  it("weekday, month, ordinal day", () => {
    expect(fullDateLabel("2026-08-12")).toBe("Wednesday, August 12th");
    expect(fullDateLabel("2026-08-01")).toBe("Saturday, August 1st");
    expect(fullDateLabel("2026-08-02")).toBe("Sunday, August 2nd");
    expect(fullDateLabel("2026-08-03")).toBe("Monday, August 3rd");
  });
  it("handles the 11th–13th exception", () => {
    expect(fullDateLabel("2026-08-11")).toBe("Tuesday, August 11th");
    expect(fullDateLabel("2026-08-13")).toBe("Thursday, August 13th");
  });
});

describe("weekRangeLabel", () => {
  it("same month uses a compact range", () => {
    expect(weekRangeLabel("2026-07-20", "2026-07-26")).toBe("Week of July 20–26");
  });
  it("crossing a month boundary spells both months", () => {
    expect(weekRangeLabel("2026-07-27", "2026-08-02")).toBe("Week of July 27 – August 2");
  });
});
