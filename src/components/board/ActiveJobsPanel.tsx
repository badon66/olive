import type { CategoryStore } from "../../hooks/useCategories";
import type { Job } from "../../hooks/useJobs";
import type { Task } from "../../hooks/useTasks";
import { isActiveStatus, jobTaskStats, JOB_STATUSES, JOB_STATUS_LABELS, sortJobs } from "../../lib/jobs";

// Compact dashboard panel for the still-open jobs. Deliberately thicker than a
// bare name-and-status line: header, its own task-stat summary, and (in add mode)
// a "+" that adds a task already scoped to that job.
export function ActiveJobsPanel({
  jobs,
  tasks,
  today,
  categoryStore,
  onOpen,
  onEditStatus,
  onAddTask,
  customize = false,
}: {
  jobs: Job[];
  tasks: Task[];
  today: string;
  categoryStore: CategoryStore;
  onOpen: () => void;
  // Inline status editing — deliberately NOT gated behind the add-mode pencil
  onEditStatus?: (jobId: string, status: Job["status"]) => void;
  onAddTask?: (jobId: string) => void;
  customize?: boolean;
}) {
  const active = jobs.filter((j) => isActiveStatus(j.status)).sort(sortJobs);

  if (active.length === 0) {
    return <p className="text-dim text-xs py-1">No active jobs — say "add a job, Dennis's driveway".</p>;
  }

  return (
    <ul className="divide-y divide-signal-dim/15">
      {active.map((job) => {
        const cat = job.category_id ? categoryStore.byId.get(job.category_id) : undefined;
        const stats = jobTaskStats(tasks, job.id, today);
        const accent = cat?.color ?? "#7FA89A";
        return (
          <li key={job.id} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <button
                  onClick={onOpen}
                  className="w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                  aria-label={`${job.name} — open Active Jobs`}
                >
                  <p className="font-body font-semibold text-[14px] truncate">{job.name}</p>
                  <p className="font-data text-[10px] text-dim truncate">{cat?.name ?? "No header"}</p>
                </button>

                {/* Status chips — click to change, no pencil required */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {JOB_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => onEditStatus?.(job.id, s)}
                      disabled={!onEditStatus}
                      aria-pressed={job.status === s}
                      className={`font-data text-[9.5px] px-1.5 py-0.5 rounded border transition-colors duration-200 ${
                        job.status === s
                          ? "border-signal text-signal bg-signal/10"
                          : "border-signal-dim/25 text-dim/70 hover:border-signal-dim hover:text-dim"
                      } ${onEditStatus ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {JOB_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                {/* Task-stat summary for this job's own tasks */}
                <p className="flex items-center gap-2 mt-1.5 font-data text-[10px]">
                  <span className="text-dim">{stats.upcoming} upcoming</span>
                  <span className="text-signal">{stats.active} active</span>
                  <span className={stats.overdue > 0 ? "text-amber" : "text-dim/50"}>{stats.overdue} overdue</span>
                </p>
              </div>

              {customize && onAddTask && (
                <button
                  onClick={() => onAddTask(job.id)}
                  aria-label={`Add a task to ${job.name}`}
                  className="shrink-0 w-7 h-7 grid place-items-center rounded border border-signal/50 text-signal cursor-pointer hover:bg-signal/15 hover:shadow-[0_0_10px_rgba(63,169,104,0.3)] transition duration-200 focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
