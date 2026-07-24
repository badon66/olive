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
  const dentist = [{ start: "14:00", end: "15:30", label: "dentist" }];
  it("blocks the section a window overlaps", () => {
    expect(sectionBlocked("afternoon", dentist)).toBe(true);
  });
  it("leaves other sections open", () => {
    expect(sectionBlocked("morning", dentist)).toBe(false);
    expect(sectionBlocked("evening", dentist)).toBe(false);
  });
  it("anytime is never blocked", () => {
    expect(sectionBlocked("anytime", [{ start: "00:00", end: "23:59", label: "x" }])).toBe(false);
  });
});

describe("currentSection", () => {
  // Edmonton is UTC-6 in July (MDT), so 16:00Z = 10:00 local
  const at = (utcHour: number) => new Date(Date.UTC(2026, 6, 7, utcHour, 0, 0));
  it("maps the local clock to the right part of day", () => {
    expect(currentSection(at(16))).toBe("morning"); // 10:00 local
    expect(currentSection(at(19))).toBe("midday"); // 13:00 local
    expect(currentSection(at(21))).toBe("afternoon"); // 15:00 local
    expect(currentSection(at(1))).toBe("evening"); // 19:00 local (prev day UTC+1)
  });
  it("falls back to anytime in the small hours", () => {
    expect(currentSection(at(9))).toBe("anytime"); // 03:00 local
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
    expect(r.afternoon).toHaveLength(0); // afternoon is blocked
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
