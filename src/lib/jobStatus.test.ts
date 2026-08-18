import { describe, expect, it } from "vitest";
import { fromLegacyStatus, isActiveTriple, jobStatusTriple, tripleSummary } from "./jobStatus";

describe("fromLegacyStatus — the migration's data mapping", () => {
  it("quoted: nothing sold, no work, unpaid", () => {
    expect(fromLegacyStatus("quoted")).toEqual({
      sale_status: "quoted",
      work_status: "not_started",
      payment_status: "unpaid",
    });
  });
  it("sold: sold but work not started, unpaid", () => {
    expect(fromLegacyStatus("sold")).toEqual({
      sale_status: "sold",
      work_status: "not_started",
      payment_status: "unpaid",
    });
  });
  it("in_progress implies sold — you can't work an unsold job", () => {
    expect(fromLegacyStatus("in_progress")).toEqual({
      sale_status: "sold",
      work_status: "in_progress",
      payment_status: "unpaid",
    });
  });
  it("paid implies sold + completed work", () => {
    expect(fromLegacyStatus("paid")).toEqual({
      sale_status: "sold",
      work_status: "completed",
      payment_status: "paid",
    });
  });
  it("every legacy value maps to a fully-populated triple", () => {
    for (const s of ["quoted", "sold", "in_progress", "paid"] as const) {
      const t = fromLegacyStatus(s);
      expect(t.sale_status).toBeTruthy();
      expect(t.work_status).toBeTruthy();
      expect(t.payment_status).toBeTruthy();
    }
  });
});

describe("jobStatusTriple — works either side of the migration", () => {
  it("prefers the new columns when present", () => {
    expect(
      jobStatusTriple({ sale_status: "sold", work_status: "completed", payment_status: "unpaid", status: "quoted" }),
    ).toEqual({ sale_status: "sold", work_status: "completed", payment_status: "unpaid" });
  });
  it("falls back to the legacy column on un-migrated rows", () => {
    expect(jobStatusTriple({ status: "in_progress" })).toEqual({
      sale_status: "sold",
      work_status: "in_progress",
      payment_status: "unpaid",
    });
  });
  it("defaults to quoted when there's nothing to go on", () => {
    expect(jobStatusTriple({})).toEqual({
      sale_status: "quoted",
      work_status: "not_started",
      payment_status: "unpaid",
    });
  });
});

describe("isActiveTriple", () => {
  it("retires a job only when work is done AND it's paid", () => {
    expect(isActiveTriple({ sale_status: "sold", work_status: "completed", payment_status: "paid" })).toBe(false);
  });
  it("keeps a completed-but-unpaid job on the board", () => {
    expect(isActiveTriple({ sale_status: "sold", work_status: "completed", payment_status: "unpaid" })).toBe(true);
  });
  it("keeps a paid-but-still-working job on the board", () => {
    expect(isActiveTriple({ sale_status: "sold", work_status: "in_progress", payment_status: "paid" })).toBe(true);
  });
});

describe("tripleSummary", () => {
  it("renders all three dimensions", () => {
    expect(tripleSummary({ sale_status: "sold", work_status: "in_progress", payment_status: "unpaid" })).toBe(
      "Sold · In progress · Unpaid",
    );
  });
});
