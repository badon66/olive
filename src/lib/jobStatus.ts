// Job status as THREE independent dimensions (BUILD_PLAN update): a job can be
// sold but not started, or paid while still in progress — the old single enum
// couldn't say either. Mirrors migration 20260812000001.

export const SALE_STATUSES = ["quoted", "sold"] as const;
export const WORK_STATUSES = ["not_started", "in_progress", "completed"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid"] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type JobStatusTriple = {
  sale_status: SaleStatus;
  work_status: WorkStatus;
  payment_status: PaymentStatus;
};

export const SALE_LABELS: Record<SaleStatus, string> = { quoted: "Quoted", sold: "Sold" };
export const WORK_LABELS: Record<WorkStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};
export const PAYMENT_LABELS: Record<PaymentStatus, string> = { unpaid: "Unpaid", paid: "Paid" };

// The legacy flat pipeline, kept only to translate pre-migration rows.
type LegacyStatus = "quoted" | "sold" | "in_progress" | "paid";

// Same mapping the SQL backfill performs — kept here so the client can render
// legacy rows identically to migrated ones, and so the mapping is testable.
export function fromLegacyStatus(status: LegacyStatus): JobStatusTriple {
  switch (status) {
    case "quoted":
      return { sale_status: "quoted", work_status: "not_started", payment_status: "unpaid" };
    case "sold":
      return { sale_status: "sold", work_status: "not_started", payment_status: "unpaid" };
    case "in_progress":
      return { sale_status: "sold", work_status: "in_progress", payment_status: "unpaid" };
    case "paid":
      return { sale_status: "sold", work_status: "completed", payment_status: "paid" };
  }
}

// Reads a job row that may or may not have been migrated yet, so the UI works
// either side of the migration.
export function jobStatusTriple(
  job: Partial<JobStatusTriple> & { status?: LegacyStatus },
): JobStatusTriple {
  if (job.sale_status && job.work_status && job.payment_status) {
    return { sale_status: job.sale_status, work_status: job.work_status, payment_status: job.payment_status };
  }
  return fromLegacyStatus(job.status ?? "quoted");
}

// A job is "active" (still on the board) until the work is finished AND it's
// paid. Under the old enum only `paid` retired a job; now an unpaid completed
// job correctly stays visible.
export function isActiveTriple(t: JobStatusTriple): boolean {
  return !(t.work_status === "completed" && t.payment_status === "paid");
}

// One-line summary for compact surfaces, e.g. "Sold · In progress · Unpaid".
export function tripleSummary(t: JobStatusTriple): string {
  return [SALE_LABELS[t.sale_status], WORK_LABELS[t.work_status], PAYMENT_LABELS[t.payment_status]].join(" · ");
}
