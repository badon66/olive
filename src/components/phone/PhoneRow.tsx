import { useState } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyTask } from "../../hooks/useWeeklyTasks";
import { useChecklistStore } from "../../hooks/useChecklists";
import type { ActiveRow } from "../../lib/activeRows";
import { progressLabel } from "../../lib/checklist";
import { formatClock } from "../../lib/dates";
import { dayIsDone, schedulingMode, whenLabel } from "../../lib/flexible";
import { cubeStates, progress } from "../../lib/weekly";
import { ReorderArrows } from "../ReorderArrows";
import { usePhone } from "./PhoneContext";
import { IconCheck } from "./icons";

// One row on the phone — a regular task or a weekly occurrence, through the
// same component (as on desktop, arrows never branch on item type).
//
// Touch model (BUILD_PLAN): the big checkbox completes instantly with an undo
// toast; tapping anywhere else on the row opens the bottom sheet. No
// double-click. Reorder arrows appear only while the pencil is on.

type Row = ActiveRow<Task, WeeklyTask>;

const firstLine = (s: string | null) => (s ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";

export function PhoneRow({
  row,
  date,
  index,
  count,
  onMove,
  canUp,
  canDown,
  suggested = false,
}: {
  row: Row;
  // The day this row stands for (the active day on Now, the viewed day on Today).
  date: string;
  index?: number;
  count?: number;
  onMove?: (index: number, dir: -1 | 1) => void;
  canUp?: boolean;
  canDown?: boolean;
  // A pull-forward suggestion (Today tab): dimmed and labelled, never blended.
  suggested?: boolean;
}) {
  const { categoryStore, weeklyStore, customize, openSheet, toggleTask, toggleWeekly } = usePhone();
  const checklist = useChecklistStore();
  // The tick lands on screen immediately; the store write follows a beat later
  // so the row visibly checks before it leaves the list.
  const [ticking, setTicking] = useState(false);

  let title: string;
  let done: boolean;
  let checklistCount: string | null;
  const meta: { text: string; tone?: "amber" | "signal" }[] = [];
  let category: { name: string; color: string } | undefined;

  if (row.kind === "task") {
    const t = row.task;
    title = t.title;
    const perDay = schedulingMode(t) === "pick";
    done = perDay ? dayIsDone(t, date) : t.status === "completed";
    category = categoryStore.byId.get(t.category_id);
    const when = whenLabel(t, date);
    // "Today" on a list that is already today's says nothing — only a range's
    // days left, an overdue count or another day earns room on the line.
    if (when && !done && !(schedulingMode(t) === "fixed" && t.due_date === date)) {
      meta.push({ text: when.text, tone: when.overdue ? "amber" : undefined });
    }
    if (t.scheduled_time) meta.push({ text: formatClock(t.scheduled_time), tone: "signal" });
    checklistCount = progressLabel(checklist?.taskProgress(t.id));
    if (checklistCount) meta.push({ text: `☑ ${checklistCount}` });
    const desc = firstLine(t.description);
    if (desc) meta.push({ text: desc });
  } else {
    const w = row.weekly;
    title = w.name;
    const rows = weeklyStore.checkins.filter((c) => c.weekly_task_id === w.id);
    done = rows.some((c) => c.date === date && c.status === "completed");
    const p = progress(w, cubeStates(w, rows, date));
    meta.push({ text: `Weekly · ${p.completed} of ${p.target} this week` });
    if (w.scheduled_time) meta.push({ text: formatClock(w.scheduled_time), tone: "signal" });
    if (w.overridden.length > 0) meta.push({ text: "just this day", tone: "amber" });
    checklistCount = progressLabel(checklist?.weeklyProgress(w.id, date));
    if (checklistCount) meta.push({ text: `☑ ${checklistCount}` });
  }

  const checked = done || ticking;
  const onCheck = () => {
    if (done) {
      if (row.kind === "task") toggleTask(row.task, date);
      else toggleWeekly(row.weekly, date, true);
      return;
    }
    setTicking(true);
    window.setTimeout(() => {
      if (row.kind === "task") toggleTask(row.task, date);
      else toggleWeekly(row.weekly, date, false);
      setTicking(false);
    }, 260);
  };
  const onOpen = () =>
    openSheet(row.kind === "task" ? { kind: "task", task: row.task, date } : { kind: "weekly", weekly: row.weekly, date });

  return (
    <div
      className={`flex items-stretch transition-opacity duration-300 ${suggested ? "opacity-60" : ""} ${
        ticking ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onCheck}
        aria-label={checked ? `Mark ${title} not done` : `Complete ${title}`}
        aria-pressed={checked}
        className="shrink-0 w-14 min-h-[56px] grid place-items-center focus-visible:outline-2 focus-visible:outline-signal rounded-full"
      >
        <span
          className={`w-7 h-7 rounded-full border-2 grid place-items-center transition-[background-color,border-color] duration-200 ${
            checked ? "border-signal bg-signal-dim" : "border-signal-dim/80"
          }`}
        >
          <span className={`text-hud transition-transform duration-300 ease-[var(--ease-spring)] ${checked ? "scale-100" : "scale-0"}`}>
            <IconCheck className="w-4 h-4" />
          </span>
        </span>
      </button>

      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left py-2.5 pr-2 focus-visible:outline-2 focus-visible:outline-signal rounded"
        aria-label={`Open ${title}`}
      >
        <span className={`block font-body font-semibold text-[17px] leading-snug line-clamp-2 ${checked ? "line-through text-dim" : "text-hud"}`}>
          {title}
          {suggested && <span className="ml-2 align-middle hud-chip !text-[10px]">suggested</span>}
        </span>
        <span className="flex items-center gap-1.5 mt-0.5 font-data text-[12px] text-dim min-w-0">
          {category && (
            <span className="shrink-0 inline-flex items-center gap-1" style={{ color: category.color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: category.color }} aria-hidden="true" />
              {category.name}
            </span>
          )}
          <span className="truncate">
            {meta.map((m, i) => (
              <span key={i} className={m.tone === "amber" ? "text-amber" : m.tone === "signal" ? "text-signal" : ""}>
                {(i > 0 || category) && <span className="text-dim/50"> · </span>}
                {m.text}
              </span>
            ))}
          </span>
        </span>
      </button>

      {customize && onMove && index !== undefined && count !== undefined && (
        <div className="shrink-0 grid place-items-center pr-1">
          <ReorderArrows index={index} count={count} label={title} onMove={onMove} canUp={canUp} canDown={canDown} />
        </div>
      )}
    </div>
  );
}
