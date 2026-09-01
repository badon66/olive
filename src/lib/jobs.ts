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

// Jobs whose updated_at falls on the given Edmonton date (the 1:30 AM VIEW day
// as everything else) — used by the brief for "changed yesterday".
export function changedOn<T extends JobLike>(jobs: T[], date: string): T[] {
  return jobs.filter((j) => edmontonToday(new Date(j.updated_at)) === date);
}

export type JobTaskStats = {
  upcoming: number;
  active: number;
  overdue: number;
  done: number;
  total: number;
};

// Per-job task summary for the dashboard panel. The three live buckets count
// only OPEN tasks:
//  • overdue  — due before today
//  • active   — due today
//  • upcoming — due after today, or not scheduled at all
// plus done/total over ALL of the job's tasks, so a job whose work is finished
// doesn't look identical to one that never had any tasks.
export function jobTaskStats<T extends { job_id: string | null; status: string; due_date: string | null }>(
  tasks: T[],
  jobId: string,
  today: string,
): JobTaskStats {
  const all = tasks.filter((t) => t.job_id === jobId);
  const mine = all.filter((t) => t.status === "open");
  return {
    overdue: mine.filter((t) => t.due_date !== null && t.due_date < today).length,
    active: mine.filter((t) => t.due_date === today).length,
    upcoming: mine.filter((t) => t.due_date === null || t.due_date > today).length,
    // Completed/total are what make an all-done job distinguishable from a job
    // with no tasks at all — without them both render as a row of zeros, which
    // is what "the stats always show zero" actually was.
    done: all.filter((t) => t.status === "completed").length,
    total: all.length,
  };
}
