import { describe, expect, it } from "vitest";
import { combineRows, type ScheduleItem } from "./ScheduleRow";

type Row = ScheduleItem<{ n: string }, { n: string }>;
const task = (id: string, time: string | null, sort: number | null = null): Row => ({ kind: "task", id, label: id, sort, time, task: { n: id } });
const weekly = (id: string, time: string | null, sort: number | null = null): Row => ({ kind: "weekly", id, label: id, sort, time, weekly: { n: id } });

describe("combineRows — rows with a clock time run in time order", () => {
  it("a weekly occurrence pinned to 7 AM lists above a 10 AM booking", () => {
    const rows = combineRows([task("dentist", "10:00:00"), task("untimed", null)], [weekly("gym", "07:00")]);
    expect(rows.map((r) => r.id)).toEqual(["gym", "dentist", "untimed"]);
  });
  it("untimed rows keep their incoming order, after the timed ones", () => {
    const rows = combineRows([task("a", null), task("b", null)], [weekly("w", null)]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "w"]);
  });
  it("a manual order still wins over clock time", () => {
    const rows = combineRows([task("dentist", "10:00:00", 0)], [weekly("gym", "07:00", 1)]);
    expect(rows.map((r) => r.id)).toEqual(["dentist", "gym"]);
  });
});
