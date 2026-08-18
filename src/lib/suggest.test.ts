import { describe, expect, it } from "vitest";
import { currentSection, pullForward, sectionBlocked, type SuggestTask } from "./suggest";

const TODAY = "2026-07-07";

const task = (over: Partial<SuggestTask> & { id: string }): SuggestTask => ({
  due_date: null,
  time_section: null,
  priority_weight: 3,
  duration_minutes: null,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("sectionBlocked", () => {
  // 2:00–3:30 PM sits inside Midday (12–4 PM) under the resolved boundaries,
  // not Afternoon (4–6 PM).
  const dentist = [{ start: "14:00", end: "15:30", label: "dentist" }];
  it("blocks the section a window overlaps", () => {
    expect(sectionBlocked("midday", dentist)).toBe(true);
  });
  it("leaves other sections open", () => {
    expect(sectionBlocked("afternoon", dentist)).toBe(false);
    expect(sectionBlocked("evening", dentist)).toBe(false);
  });
  it("a 4:30 PM window blocks Afternoon", () => {
    expect(sectionBlocked("afternoon", [{ start: "16:30", end: "17:00", label: "x" }])).toBe(true);
  });
  it("anytime is never blocked", () => {
    expect(sectionBlocked("anytime", [{ start: "00:00", end: "23:59", label: "x" }])).toBe(false);
  });
});

describe("currentSection", () => {
  // Edmonton is UTC-6 in July (MDT), so 16:00Z = 10:00 local
  const at = (utcHour: number) => new Date(Date.UTC(2026, 6, 7, Math.floor(utcHour), (utcHour % 1) * 60, 0));
  it("maps the local clock to the right part of day (resolved boundaries)", () => {
    expect(currentSection(at(16))).toBe("morning"); // 10:00 local
    expect(currentSection(at(19))).toBe("midday"); // 13:00 local
    expect(currentSection(at(23))).toBe("afternoon"); // 17:00 local
    expect(currentSection(at(2))).toBe("evening"); // 20:00 local (prev day UTC+1)
  });
  it("the small hours are Night, all the way to 5 AM", () => {
    expect(currentSection(at(6))).toBe("night"); // 00:00 local
    expect(currentSection(at(8))).toBe("night"); // 02:00 local
    expect(currentSection(at(8.5))).toBe("night"); // 02:30 local — the case that used to straddle
    expect(currentSection(at(10))).toBe("night"); // 04:00 local
  });
  it("5 AM local is Morning — the day has rolled over", () => {
    expect(currentSection(at(11))).toBe("morning"); // 05:00 local
  });
  it("late evening rolls into Night at 23:00", () => {
    expect(currentSection(at(5))).toBe("night"); // 23:00 local
  });
  it("noon is Midday and 4 PM is Afternoon", () => {
    expect(currentSection(at(18))).toBe("midday"); // 12:00 local
    expect(currentSection(at(22))).toBe("afternoon"); // 16:00 local
  });
});

describe("sectionBlocked — Night wraps midnight", () => {
  it("a 01:00–03:00 window blocks Night", () => {
    expect(sectionBlocked("night", [{ start: "01:00", end: "03:00", label: "x" }])).toBe(true);
  });
  it("a 23:30–23:50 window also blocks Night", () => {
    expect(sectionBlocked("night", [{ start: "23:30", end: "23:50", label: "x" }])).toBe(true);
  });
  it("an afternoon window does not block Night", () => {
    expect(sectionBlocked("night", [{ start: "14:00", end: "15:00", label: "x" }])).toBe(false);
  });
  it("morning runs from the 5 AM day boundary to noon", () => {
    expect(sectionBlocked("morning", [{ start: "04:00", end: "04:30", label: "x" }])).toBe(false); // still Night
    expect(sectionBlocked("morning", [{ start: "06:00", end: "06:30", label: "x" }])).toBe(true);
    expect(sectionBlocked("morning", [{ start: "11:30", end: "11:50", label: "x" }])).toBe(true);
  });
  it("a 4 AM window blocks Night, since Night runs to 5 AM", () => {
    expect(sectionBlocked("night", [{ start: "04:00", end: "04:30", label: "x" }])).toBe(true);
  });
});

describe("pullForward", () => {
  it("fills empty sections with unscheduled tasks, highest priority first", () => {
    const open = [
      task({ id: "lo", priority_weight: 2 }),
      task({ id: "hi", priority_weight: 5 }),
    ];
    const r = pullForward(open, TODAY, []);
    // Highest priority lands in the first open section (morning)
    expect(r.morning[0]).toBe("hi");
    // Every unscheduled task is placed exactly once across all sections
    const placed = Object.values(r).flat();
    expect(placed.filter((id) => id === "hi")).toHaveLength(1);
    expect(placed).toContain("lo");
  });

  it("skips a section already full of due-today work (no room)", () => {
    const open = [
      // 120 min of due-today work in the morning fills its cap
      task({ id: "due1", due_date: TODAY, time_section: "morning", duration_minutes: 120 }),
      task({ id: "filler", priority_weight: 5 }),
    ];
    const r = pullForward(open, TODAY, []);
    expect(r.morning).toHaveLength(0); // full → no pull-forward
    expect(r.midday).toContain("filler"); // lands in the next open section
  });

  it("never suggests into a blocked window", () => {
    const windows = [{ start: "14:00", end: "15:30", label: "dentist" }];
    const open = [task({ id: "a" }), task({ id: "b" }), task({ id: "c" }), task({ id: "d" }), task({ id: "e" })];
    const r = pullForward(open, TODAY, windows);
    expect(r.midday).toHaveLength(0); // 2–3:30 PM sits in Midday, which is blocked
  });

  it("does not pull scheduled tasks forward (only due_date === null)", () => {
    const open = [task({ id: "sched", due_date: "2026-07-10", priority_weight: 5 })];
    const r = pullForward(open, TODAY, []);
    expect(Object.values(r).flat()).not.toContain("sched");
  });

  it("uses duration_minutes as the room guide", () => {
    const open = [
      task({ id: "big", priority_weight: 5, duration_minutes: 120 }), // fills morning alone
      task({ id: "next", priority_weight: 4, duration_minutes: 30 }),
    ];
    const r = pullForward(open, TODAY, []);
    expect(r.morning).toEqual(["big"]); // 120 min → morning is full after one
    expect(r.midday).toContain("next");
  });
});
