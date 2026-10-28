import type { ReactNode } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyTask } from "../../hooks/useWeeklyTasks";
import { useChecklistStore } from "../../hooks/useChecklists";
import { taskActionHandlers } from "../../hooks/useTaskActions";
import { formatClock, formatCompleted, fullDateLabel } from "../../lib/dates";
import { dayIsDone, daysLeft, daysLeftLabel, schedulingMode, spanLabel, whenLabel } from "../../lib/flexible";
import { priorityLabel } from "../../lib/priority";
import { sectionOptionLabel } from "../../lib/sections";
import { cubeStates, findDayOverride, progress, resolveWeeklyDay } from "../../lib/weekly";
import { ChecklistEditor } from "../ChecklistEditor";
import { ModalShell } from "../ModalShell";
import { TaskActionsBody } from "../TaskActionPopup";
import { recurrenceLabel } from "../WeeklyTasksView";
import { usePhone } from "./PhoneContext";
import { IconCheck } from "./icons";

// Tap a row (not its checkbox) → this sheet (BUILD_PLAN "Touch interaction
// model"): the details, the checklist, and the quick actions — Delete for
// today / Skip for the day / Reschedule for a task, Skip today for a weekly
// occurrence — plus Edit for the full form. The actions are the SAME component
// and the SAME handlers as the desktop popup (TaskActionsBody +
// taskActionHandlers), embedded here.

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-panel-border/60 last:border-b-0">
      <dt className="w-24 shrink-0 font-data text-[11px] uppercase tracking-wider text-dim pt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0 font-body text-[15px] text-hud">{children}</dd>
    </div>
  );
}

export function TaskSheet({ task: initialTask, date }: { task: Task; date: string }) {
  const { taskStore, weeklyStore, categoryStore, jobStore, today, closeSheet, openSheet, toggleTask } = usePhone();
  const checklist = useChecklistStore();
  // Read the live row, so a tick or an edit made here shows at once.
  const task = taskStore.tasks.find((t) => t.id === initialTask.id) ?? initialTask;
  const category = categoryStore.byId.get(task.category_id);
  const job = task.job_id ? jobStore.jobs.find((j) => j.id === task.job_id) : undefined;
  const perDay = schedulingMode(task) === "pick";
  const done = perDay ? dayIsDone(task, date) : task.status === "completed";
  const span = spanLabel(task);
  const when = whenLabel(task, date);
  const items = checklist?.itemsForTask(task.id) ?? [];

  return (
    <ModalShell label={task.title} onClose={closeSheet} className="px-5 pb-5 pt-1 space-y-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => toggleTask(task, date)}
          aria-label={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          aria-pressed={done}
          className="shrink-0 w-12 h-12 -ml-2 grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-signal"
        >
          <span className={`w-8 h-8 rounded-full border-2 grid place-items-center ${done ? "border-signal bg-signal-dim text-hud" : "border-signal-dim"}`}>
            {done && <IconCheck className="w-4 h-4" />}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className={`font-body font-bold text-[21px] leading-tight ${done ? "line-through text-dim" : "text-hud"}`}>{task.title}</h2>
          <p className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {category && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-sm font-data text-[10.5px] uppercase tracking-wide"
                style={{ color: category.color, background: `${category.color}1f`, border: `1px solid ${category.color}55` }}
              >
                {category.name}
              </span>
            )}
            <span className={`hud-chip ${task.priority_weight >= 3 ? "hud-chip-amber" : ""}`}>{priorityLabel(task.priority_weight)} priority</span>
            {done && <span className="hud-chip hud-chip-signal">{perDay && task.status !== "completed" ? "Done for this day" : formatCompleted(task.completed_at, today)}</span>}
          </p>
        </div>
      </div>

      <dl>
        <Detail label="When">
          {span ? (
            <>
              {span}
              {!done && <span className="text-dim"> · {daysLeftLabel(daysLeft(task, date) ?? 0)}</span>}
            </>
          ) : task.due_date ? (
            <>
              {fullDateLabel(task.due_date)}
              {!done && when && <span className={when.overdue ? "text-amber" : "text-dim"}> · {when.text}</span>}
            </>
          ) : (
            <span className="text-dim">Not scheduled</span>
          )}
        </Detail>
        {task.scheduled_time && <Detail label="Booked">{formatClock(task.scheduled_time)}</Detail>}
        <Detail label="Part of day">{sectionOptionLabel(task.time_section ?? "anytime")}</Detail>
        {task.duration_minutes && <Detail label="Takes">{task.duration_minutes} min</Detail>}
        {job && <Detail label="Job">{job.name}</Detail>}
        {task.description && (
          <Detail label="Notes">
            <span className="whitespace-pre-line text-hud/90">{task.description}</span>
          </Detail>
        )}
      </dl>

      {checklist && (
        <ChecklistEditor
          rows={items.map((i) => ({ id: i.id, title: i.title, done: i.completed }))}
          parentTitle={task.title}
          parentDone={task.status === "completed"}
          onToggle={(id, d) => checklist.setItemDone(id, d)}
          onAdd={(t) => checklist.addItem({ task_id: task.id }, t)}
          onRename={(id, t) => checklist.renameItem(id, t)}
          onRemove={(id) => checklist.removeItem(id)}
          onMove={(i, dir) => checklist.moveItem({ task_id: task.id }, i, dir)}
          onCompleteParent={() => {
            toggleTask(task, date);
            closeSheet();
          }}
        />
      )}

      <div className="pt-1">
        <TaskActionsBody
          embedded
          target={{ kind: "task", task, date }}
          today={today}
          onClose={closeSheet}
          onEdit={() => openSheet({ kind: "editTask", task })}
          {...taskActionHandlers(taskStore, weeklyStore)}
        />
      </div>
    </ModalShell>
  );
}

export function WeeklySheet({ weekly: initialWeekly, date }: { weekly: WeeklyTask; date: string }) {
  const { taskStore, weeklyStore, today, closeSheet, openSheet, toggleWeekly } = usePhone();
  const checklist = useChecklistStore();
  const base = weeklyStore.weeklyTasks.find((w) => w.id === initialWeekly.id) ?? initialWeekly;
  // What this occurrence is on THIS day — a one-day rename, section or time.
  const w = resolveWeeklyDay(base, weeklyStore.dayOverrides, date);
  const override = findDayOverride(base.id, weeklyStore.dayOverrides, date);
  const rows = weeklyStore.checkins.filter((c) => c.weekly_task_id === base.id);
  const done = rows.some((c) => c.date === date && c.status === "completed");
  const p = progress(base, cubeStates(base, rows, date));
  const items = checklist?.itemsForWeekly(base.id) ?? [];
  const dayWord = date === today ? "today" : fullDateLabel(date).split(",")[0];

  return (
    <ModalShell label={w.name} onClose={closeSheet} className="px-5 pb-5 pt-1 space-y-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => toggleWeekly(base, date, done)}
          aria-label={done ? `Mark ${w.name} not done` : `Check off ${w.name}`}
          aria-pressed={done}
          className="shrink-0 w-12 h-12 -ml-2 grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-signal"
        >
          <span className={`w-8 h-8 rounded-full border-2 grid place-items-center ${done ? "border-signal bg-signal-dim text-hud" : "border-signal-dim"}`}>
            {done && <IconCheck className="w-4 h-4" />}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className={`font-body font-bold text-[21px] leading-tight ${done ? "line-through text-dim" : "text-hud"}`}>{w.name}</h2>
          <p className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="hud-chip">weekly · {recurrenceLabel(base)}</span>
            <span className={`hud-chip ${base.priority_weight >= 3 ? "hud-chip-amber" : ""}`}>{priorityLabel(base.priority_weight)} priority</span>
            {override && <span className="hud-chip hud-chip-amber">just this day</span>}
          </p>
        </div>
      </div>

      <dl>
        <Detail label="This week">
          {p.completed} of {p.target} done{p.toPlan > 0 && <span className="text-dim"> · {p.toPlan} more to plan</span>}
        </Detail>
        <Detail label="Part of day">{sectionOptionLabel(w.time_section ?? "anytime")}</Detail>
        {w.scheduled_time && <Detail label="Time">{formatClock(w.scheduled_time)}</Detail>}
      </dl>

      {checklist && (
        <ChecklistEditor
          heading={items.length > 0 ? `Checklist · ${dayWord}` : "Checklist"}
          rows={items.map((i) => ({ id: i.id, title: i.title, done: checklist.isWeeklyItemDone(i.id, date) }))}
          parentTitle={w.name}
          parentDone={done}
          completeWording={date === today ? "done for today" : `done for ${dayWord}`}
          onToggle={(id, d) => checklist.setWeeklyCheck(id, date, d)}
          onAdd={(t) => checklist.addItem({ weekly_task_id: base.id }, t)}
          onRename={(id, t) => checklist.renameItem(id, t)}
          onRemove={(id) => checklist.removeItem(id)}
          onMove={(i, dir) => checklist.moveItem({ weekly_task_id: base.id }, i, dir)}
          onCompleteParent={() => {
            toggleWeekly(base, date, false);
            closeSheet();
          }}
        />
      )}

      <div className="pt-1">
        <TaskActionsBody
          embedded
          target={{ kind: "weekly", weekly: base, date }}
          today={today}
          onClose={closeSheet}
          onEdit={() => openSheet({ kind: "editWeekly", weekly: base, date })}
          {...taskActionHandlers(taskStore, weeklyStore)}
        />
      </div>
    </ModalShell>
  );
}
