import { useState } from "react";
import type { Job } from "../../hooks/useJobs";
import { useChecklistStore } from "../../hooks/useChecklists";
import { isActiveStatus, jobTaskStats, JOB_STATUSES, JOB_STATUS_LABELS, sortJobs, type JobStatus } from "../../lib/jobs";
import { buildRows, overdueRow } from "../../lib/activeRows";
import { ChatBar } from "../ChatBar";
import { ModalShell } from "../ModalShell";
import { usePhone } from "./PhoneContext";
import { PhoneRow } from "./PhoneRow";
import { IconChevron, IconPlus } from "./icons";

// Active jobs on the phone (BUILD_PLAN "Phone app"). The ordering, the status
// pipeline and the per-job task stats are the desktop's own (lib/jobs.ts).
//
// NOT BUILT YET, so not shown (never faked): a job's price, its deadline and
// pinned flag, and the three separate status dimensions (sale / work /
// payment). The live `active_jobs` table holds one pipeline status — Quoted →
// Sold → In Progress → Paid — so that is what the chips change, and jobs sort
// by pipeline stage then most recent rather than "pinned first, then deadline".

export function jobsInOrder(jobs: Job[]): { active: Job[]; done: Job[] } {
  return {
    active: jobs.filter((j) => isActiveStatus(j.status)).sort(sortJobs),
    done: jobs.filter((j) => !isActiveStatus(j.status)).sort(sortJobs),
  };
}

function StatusChips({ job, size = "md" }: { job: Job; size?: "sm" | "md" }) {
  const { jobStore } = usePhone();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${job.name} status`}>
      {JOB_STATUSES.map((s: JobStatus) => (
        <button
          key={s}
          // Inline, no pencil needed — the same deliberate exception as desktop.
          onClick={(e) => {
            e.stopPropagation();
            void jobStore.updateJob(job.id, { status: s });
          }}
          aria-pressed={job.status === s}
          className={`font-data rounded-md border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
            size === "sm" ? "text-[12px] px-2.5 min-h-[44px]" : "text-[13px] px-3 min-h-[44px]"
          } ${job.status === s ? "border-signal text-signal bg-signal/15" : "border-signal-dim/40 text-dim"}`}
        >
          {JOB_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function statLine(stats: ReturnType<typeof jobTaskStats>): { text: string; tone?: "amber" }[] {
  const open = stats.upcoming + stats.active + stats.overdue;
  if (stats.total === 0) return [{ text: "No tasks yet" }];
  const parts: { text: string; tone?: "amber" }[] = [{ text: `${open} task${open === 1 ? "" : "s"}` }];
  if (stats.overdue > 0) parts.push({ text: `${stats.overdue} overdue`, tone: "amber" });
  if (stats.active > 0) parts.push({ text: `${stats.active} today` });
  if (stats.upcoming > 0) parts.push({ text: `${stats.upcoming} upcoming` });
  if (stats.done > 0) parts.push({ text: `${stats.done}/${stats.total} done` });
  return parts;
}

export function JobCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  const { taskStore, categoryStore, today, openSheet } = usePhone();
  const cat = job.category_id ? categoryStore.byId.get(job.category_id) : undefined;
  const stats = jobTaskStats(taskStore.tasks, job.id, today);
  const paid = !isActiveStatus(job.status);
  return (
    <div
      className={`rounded-lg border border-panel-border bg-panel ${compact ? "p-3" : "p-3.5"} ${paid ? "opacity-60" : ""}`}
      style={{ borderLeft: `3px solid ${cat?.color ?? "rgba(127,168,154,0.35)"}` }}
    >
      <button
        onClick={() => openSheet({ kind: "job", jobId: job.id })}
        className="w-full text-left min-h-[44px] focus-visible:outline-2 focus-visible:outline-signal rounded"
        aria-label={`Open ${job.name}`}
      >
        <span className="flex items-center gap-2">
          <span className="flex-1 min-w-0 font-body font-semibold text-[17px] text-hud truncate">{job.name}</span>
          <IconChevron className="w-4 h-4 text-dim shrink-0" />
        </span>
        <span className="flex items-center gap-1.5 mt-0.5 font-data text-[12px] text-dim min-w-0">
          <span className="shrink-0" style={{ color: cat?.color }}>
            {cat?.name ?? "No company"}
          </span>
          {statLine(stats).map((p, i) => (
            <span key={i} className={`truncate ${p.tone === "amber" ? "text-amber" : ""}`}>
              <span className="text-dim/50">· </span>
              {p.text}
            </span>
          ))}
        </span>
      </button>
      <div className="mt-2">
        <StatusChips job={job} size={compact ? "sm" : "md"} />
      </div>
    </div>
  );
}

// The full list: from "See all" on Now, or More → Active Jobs.
export function JobsList() {
  const { jobStore, customize, openSheet } = usePhone();
  const [showDone, setShowDone] = useState(false);
  const { active, done } = jobsInOrder(jobStore.jobs);
  return (
    <div className="px-3 pt-3 pb-28 space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <p className="font-data text-[11px] uppercase tracking-widest text-dim">
          {active.length} active job{active.length === 1 ? "" : "s"}
        </p>
        {customize && (
          <button
            onClick={() => openSheet({ kind: "editJob", job: null })}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-signal/50 text-signal font-data text-[12px]"
          >
            <IconPlus className="w-4 h-4" /> New job
          </button>
        )}
      </div>
      {active.length === 0 && (
        <p className="text-dim text-[15px] px-1 py-4">No active jobs — say "add a job, Dennis's driveway".</p>
      )}
      {active.map((j) => (
        <JobCard key={j.id} job={j} />
      ))}
      {done.length > 0 && (
        <button
          onClick={() => setShowDone((v) => !v)}
          aria-expanded={showDone}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] font-data text-[12px] text-dim"
        >
          <IconChevron dir={showDone ? "up" : "down"} />
          {showDone ? "Hide completed" : `Show completed (${done.length})`}
        </button>
      )}
      {showDone && done.map((j) => <JobCard key={j.id} job={j} />)}
    </div>
  );
}

// Job detail as a bottom sheet: status, notes, its tasks, and the job's own
// capture box (tasks described in your words, polished into clean titles,
// through the preview modal — the same job-scoped capture as desktop).
export function JobSheet({ jobId }: { jobId: string }) {
  const { jobStore, taskStore, categoryStore, checklistRefresh, today, customize, closeSheet, openSheet, toast } = usePhoneJob();
  const job = jobStore.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const cat = job.category_id ? categoryStore.byId.get(job.category_id) : undefined;
  const isOverdue = overdueRow(today);
  const openTasks = taskStore.tasks.filter((t) => t.job_id === job.id && t.status === "open");
  const doneCount = taskStore.tasks.filter((t) => t.job_id === job.id && t.status === "completed").length;
  const rows = buildRows(openTasks, [], isOverdue);
  return (
    <ModalShell label={job.name} onClose={closeSheet} className="px-5 pb-5 pt-1 space-y-4">
      <div>
        <h2 className="font-body font-bold text-[21px] leading-tight text-hud">{job.name}</h2>
        <p className="font-data text-[12px] mt-1" style={{ color: cat?.color ?? "var(--color-dim)" }}>
          {cat?.name ?? "No company"}
        </p>
      </div>
      <StatusChips job={job} />
      {job.notes && <p className="text-hud/90 text-[15px] whitespace-pre-line">{job.notes}</p>}

      <section>
        <div className="flex items-center justify-between mb-1">
          <p className="font-data text-[11px] uppercase tracking-widest text-dim">
            Tasks · {openTasks.length} open{doneCount > 0 ? ` · ${doneCount} done` : ""}
          </p>
          {customize && (
            <button
              onClick={() => openSheet({ kind: "addTask", defaults: { job_id: job.id, category_id: job.category_id ?? undefined } })}
              aria-label={`Add a task to ${job.name}`}
              className="w-11 h-11 grid place-items-center rounded-lg border border-signal/50 text-signal"
            >
              <IconPlus />
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-dim text-[14px] py-1">No open tasks for this job.</p>
        ) : (
          <div className="divide-y divide-signal-dim/15 -mx-2">
            {rows.map((r) => (
              <PhoneRow key={`${r.kind}-${r.id}`} row={r} date={today} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="font-data text-[11px] uppercase tracking-widest text-dim">Add a task to this job</p>
        <ChatBar
          inline
          job={{ id: job.id, name: job.name, category_name: cat?.name ?? null }}
          onReply={(text) => toast(text)}
          onActionDone={async () => {
            await Promise.all([taskStore.refresh(), jobStore.refresh(), checklistRefresh()]);
          }}
          taskTitleById={(id) => taskStore.tasks.find((t) => t.id === id)?.title}
        />
        <p className="font-data text-[10.5px] text-dim/70">
          Say what needs doing in your own words — Olive cleans up the title and shows it before saving.
        </p>
      </section>

      <button className="hud-button w-full" onClick={() => openSheet({ kind: "editJob", job })}>
        Edit job
      </button>
    </ModalShell>
  );
}

// The job sheet also needs the checklist store's refresh (a job capture can
// carry checklist items).
function usePhoneJob() {
  const ctx = usePhone();
  const checklist = useChecklistStore();
  return { ...ctx, checklistRefresh: async () => checklist?.refresh() };
}
