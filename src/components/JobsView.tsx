import { useState } from "react";
import type { CategoryStore } from "../hooks/useCategories";
import type { Job, JobStore } from "../hooks/useJobs";
import type { Task, TaskStore } from "../hooks/useTasks";
import { edmontonToday } from "../lib/dates";
import { groupByStatus, JOB_STATUSES, JOB_STATUS_LABELS } from "../lib/jobs";
import { ChatBar } from "./ChatBar";
import { JobForm } from "./JobForm";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

// Full Active Jobs tab: create/edit jobs, move them through statuses, and manage
// each job's sub-tasks (added with auto-worded titles via the preview modal).
export function JobsView({
  jobStore,
  taskStore,
  categoryStore,
}: {
  jobStore: JobStore;
  taskStore: TaskStore;
  categoryStore: CategoryStore;
}) {
  const [adding, setAdding] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const today = edmontonToday();

  const groups = groupByStatus(jobStore.jobs);
  const cardProps = {
    today,
    onComplete: taskStore.completeTask,
    onReopen: taskStore.reopenTask,
    onEdit: setEditingTask,
    categoryOf: (t: Task) => categoryStore.byId.get(t.category_id),
  };

  const refreshTasksAndJobs = async () => {
    await Promise.all([taskStore.refresh(), jobStore.refresh()]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-signal text-sm tracking-[0.25em] uppercase">Active Jobs</h1>
          <span className="hud-chip">{jobStore.jobs.length}</span>
        </div>
        <button className="hud-button px-4" onClick={() => setAdding(true)}>
          + New job
        </button>
      </div>

      {jobStore.jobs.length === 0 && !jobStore.loading && (
        <div className="hud-panel p-6 text-center text-dim">
          No jobs yet — say <span className="text-hud">"add a job, Dennis's driveway"</span> or use + New job.
        </div>
      )}

      {groups.map((group) => (
        <section key={group.status} className="space-y-3">
          <h2 className="font-data text-[11px] text-dim uppercase tracking-widest">
            {JOB_STATUS_LABELS[group.status]} · {group.jobs.length}
          </h2>
          {/* auto-fit, not a hard 2-column cap: CLAUDE.md's "grid, not fixed
              columns" — a 2560px+ monitor gets more columns, not the same two
              stretched. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3 items-start">
            {group.jobs.map((job) => {
              const cat = job.category_id ? categoryStore.byId.get(job.category_id) : undefined;
              const jobTasks = taskStore.tasks
                .filter((t) => t.job_id === job.id)
                .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
              const openCount = jobTasks.filter((t) => t.status === "open").length;
              return (
                <div
                  key={job.id}
                  className="hud-panel p-3.5 space-y-3 border-l-[3px]"
                  style={{ borderLeftColor: cat?.color ?? "rgba(127,168,154,0.35)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left min-w-0 flex-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                      onClick={() => setEditingJob(job)}
                      aria-label={`Edit ${job.name}`}
                    >
                      <p className="font-body font-semibold text-[15px] truncate">{job.name}</p>
                      <p className="flex items-center gap-2 mt-0.5">
                        <span
                          className="font-data text-[9.5px] uppercase tracking-wide px-1.5 py-px rounded-sm"
                          style={{
                            color: cat?.color ?? "#7FA89A",
                            background: `${cat?.color ?? "#7FA89A"}1f`,
                            border: `1px solid ${cat?.color ?? "#7FA89A"}55`,
                          }}
                        >
                          {cat?.name ?? "No company"}
                        </span>
                        {openCount > 0 && <span className="hud-chip">{openCount} task{openCount === 1 ? "" : "s"}</span>}
                      </p>
                    </button>
                  </div>

                  {/* Inline status control — tap a stage to move the job there */}
                  <div className="flex flex-wrap gap-1.5">
                    {JOB_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => void jobStore.updateJob(job.id, { status: s })}
                        aria-pressed={job.status === s}
                        className={`font-data text-[11px] px-2 py-1 rounded border cursor-pointer transition-colors duration-150 ${
                          job.status === s
                            ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                            : "border-signal-dim/30 text-dim hover:border-signal-dim"
                        }`}
                      >
                        {JOB_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  {job.notes && <p className="text-dim text-sm whitespace-pre-line">{job.notes}</p>}

                  {jobTasks.length > 0 && (
                    <div className="divide-y divide-signal-dim/15 border-t border-signal-dim/15 pt-1">
                      {jobTasks.map((t) => (
                        <TaskCard key={t.id} task={t} {...cardProps} category={cardProps.categoryOf(t)} />
                      ))}
                    </div>
                  )}

                  {/* Per-job capture: describe a task in your own words → auto-worded
                      title → preview modal → saved and linked to this job. */}
                  <ChatBar
                    inline
                    job={{ id: job.id, name: job.name, category_name: cat?.name ?? null }}
                    onActionDone={refreshTasksAndJobs}
                    taskTitleById={(id) => taskStore.tasks.find((t) => t.id === id)?.title}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {adding && (
        <JobForm
          categories={categoryStore.categories}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await jobStore.addJob(input);
          }}
        />
      )}
      {editingJob && (
        <JobForm
          initial={editingJob}
          categories={categoryStore.categories}
          onClose={() => setEditingJob(null)}
          onSubmit={async (input) => {
            await jobStore.updateJob(editingJob.id, input);
          }}
          onDelete={async () => {
            await jobStore.deleteJob(editingJob.id);
            await taskStore.refresh(); // job_id on its tasks is now null
          }}
        />
      )}
      {editingTask && (
        <TaskForm
          initial={editingTask}
          categories={categoryStore.categories}
          onClose={() => setEditingTask(null)}
          onSubmit={async (input) => {
            await taskStore.updateTask(editingTask.id, input);
          }}
          onDelete={async () => {
            await taskStore.deleteTask(editingTask.id);
          }}
        />
      )}
    </div>
  );
}
