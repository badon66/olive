import { edmontonToday } from "./dates";

// Job pipeline stages, in the order a job typically moves through them.
export const JOB_STATUSES = ["quoted", "sold", "in_progress", "paid"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  quoted: "Quoted",
  sold: "Sold",
  in_progress: "In Progress",
  paid: "Paid",
};

// "Active" = still in the pipeline. Paid jobs are done. Drives the brief count.
export function isActiveStatus(status: JobStatus): boolean {
  return status !== "paid";
}

type JobLike = { status: JobStatus; updated_at: string };

export function activeCount<T extends JobLike>(jobs: T[]): number {
  return jobs.filter((j) => isActiveStatus(j.status)).length;
}

const STAGE_INDEX: Record<JobStatus, number> = Object.fromEntries(
  JOB_STATUSES.map((s, i) => [s, i]),
) as Record<JobStatus, number>;

// Pipeline stage ascending (active before paid), then most-recently-touched first.
export function sortJobs<T extends JobLike>(a: T, b: T): number {
  return STAGE_INDEX[a.status] - STAGE_INDEX[b.status] || b.updated_at.localeCompare(a.updated_at);
}

// Non-empty stages in pipeline order, jobs sorted within each stage.
export function groupByStatus<T extends JobLike>(jobs: T[]): { status: JobStatus; jobs: T[] }[] {
  return JOB_STATUSES.map((status) => ({
    status,
    jobs: jobs.filter((j) => j.status === status).sort(sortJobs),
  })).filter((g) => g.jobs.length > 0);
}

// Jobs whose updated_at falls on the given Edmonton date (same 1:30 AM day model
// as everything else) — used by the brief for "changed yesterday".
export function changedOn<T extends JobLike>(jobs: T[], date: string): T[] {
  return jobs.filter((j) => edmontonToday(new Date(j.updated_at)) === date);
}
