import type { CategoryStore } from "../../hooks/useCategories";
import type { Job } from "../../hooks/useJobs";
import { isActiveStatus, JOB_STATUS_LABELS, sortJobs } from "../../lib/jobs";

// Compact dashboard panel: the still-open jobs (not paid), tap to jump to the
// full Active Jobs tab. Live count, not from the brief.
export function ActiveJobsPanel({
  jobs,
  categoryStore,
  onOpen,
}: {
  jobs: Job[];
  categoryStore: CategoryStore;
  onOpen: () => void;
}) {
  const active = jobs.filter((j) => isActiveStatus(j.status)).sort(sortJobs);

  if (active.length === 0) {
    return <p className="text-dim text-xs py-1">No active jobs — say "add a job, Dennis's driveway".</p>;
  }

  return (
    <ul className="divide-y divide-signal-dim/15">
      {active.map((job) => {
        const cat = job.category_id ? categoryStore.byId.get(job.category_id) : undefined;
        return (
          <li key={job.id}>
            <button
              onClick={onOpen}
              className="w-full flex items-center gap-2.5 py-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
              aria-label={`${job.name} — ${JOB_STATUS_LABELS[job.status]}. Open Active Jobs`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: cat?.color ?? "#7FA89A", boxShadow: `0 0 6px ${cat?.color ?? "#7FA89A"}` }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 truncate font-body text-[14px]">{job.name}</span>
              <span className="hud-chip shrink-0">{JOB_STATUS_LABELS[job.status]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
