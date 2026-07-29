import { describe, expect, it } from "vitest";
import {
  activeCount,
  changedOn,
  groupByStatus,
  isActiveStatus,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  sortJobs,
  type JobStatus,
} from "./jobs";

const job = (over: { status: JobStatus; updated_at?: string; name?: string }) => ({
  id: over.name ?? over.status,
  name: over.name ?? "job",
  status: over.status,
  updated_at: over.updated_at ?? "2026-07-20T12:00:00Z",
});

describe("job status vocabulary", () => {
  it("orders statuses quoted → sold → in_progress → paid", () => {
    expect(JOB_STATUSES).toEqual(["quoted", "sold", "in_progress", "paid"]);
  });
  it("labels every status", () => {
    expect(JOB_STATUS_LABELS.in_progress).toBe("In Progress");
    expect(Object.keys(JOB_STATUS_LABELS).sort()).toEqual([...JOB_STATUSES].sort());
  });
  it("treats everything but paid as active", () => {
    expect(isActiveStatus("quoted")).toBe(true);
    expect(isActiveStatus("sold")).toBe(true);
    expect(isActiveStatus("in_progress")).toBe(true);
    expect(isActiveStatus("paid")).toBe(false);
  });
});

describe("activeCount", () => {
  it("counts non-paid jobs", () => {
    expect(
      activeCount([job({ status: "quoted" }), job({ status: "paid" }), job({ status: "in_progress" })]),
    ).toBe(2);
  });
});

describe("sortJobs", () => {
  it("orders by pipeline stage, then most-recently-updated first within a stage", () => {
    const a = job({ status: "in_progress", updated_at: "2026-07-20T12:00:00Z", name: "a" });
    const b = job({ status: "quoted", updated_at: "2026-07-19T12:00:00Z", name: "b" });
    const c = job({ status: "quoted", updated_at: "2026-07-21T12:00:00Z", name: "c" });
    const paid = job({ status: "paid", updated_at: "2026-07-22T12:00:00Z", name: "paid" });
    expect([a, b, c, paid].sort(sortJobs).map((j) => j.name)).toEqual(["c", "b", "a", "paid"]);
  });
});

describe("groupByStatus", () => {
  it("returns every stage in order, only non-empty ones, jobs sorted within", () => {
    const groups = groupByStatus([
      job({ status: "paid", name: "p" }),
      job({ status: "quoted", updated_at: "2026-07-18T12:00:00Z", name: "q1" }),
      job({ status: "quoted", updated_at: "2026-07-20T12:00:00Z", name: "q2" }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(["quoted", "paid"]);
    expect(groups[0].jobs.map((j) => j.name)).toEqual(["q2", "q1"]);
  });
});

describe("changedOn — bucketed by the Edmonton day (1:30 AM boundary)", () => {
  it("matches jobs whose updated_at falls on the given Edmonton date", () => {
    // 2026-07-20T05:00:00Z = 23:00 local Jul 19 (MDT) → still Jul 19
    const evening = job({ status: "sold", updated_at: "2026-07-20T05:00:00Z", name: "evening" });
    // 2026-07-20T18:00:00Z = 12:00 local Jul 20
    const midday = job({ status: "paid", updated_at: "2026-07-20T18:00:00Z", name: "midday" });
    expect(changedOn([evening, midday], "2026-07-20").map((j) => j.name)).toEqual(["midday"]);
    expect(changedOn([evening, midday], "2026-07-19").map((j) => j.name)).toEqual(["evening"]);
  });
});
