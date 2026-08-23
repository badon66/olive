import { useState } from "react";
import type { Task } from "../hooks/useTasks";
import { formatDue } from "../lib/dates";
import { useDoubleClick } from "./TaskActionPopup";

type Props = {
  task: Task;
  today: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  // Revised editing pattern: clicking the item opens its edit modal directly;
  // deleting happens inside that modal, not on the row
  onEdit: (task: Task) => void;
  // Double-click opens the action popup (BUILD_PLAN). Supplied by the
  // dashboard; when absent the card keeps plain single-click-to-edit behaviour.
  onDoubleClick?: (task: Task) => void;
  // Category corner tag (color + name); omit in contexts already grouped by category
  category?: { name: string; color: string };
  // How the description renders: "none" (default, hidden), "always" (shown inline,
  // e.g. Active Tasks), or "chevron" (a toggle reveals it — e.g. Today's Schedule).
  descriptionMode?: "none" | "always" | "chevron";
};

export function TaskCard({
  task,
  today,
  onComplete,
  onReopen,
  onEdit,
  onDoubleClick,
  category,
  descriptionMode = "none",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const handleTitleClick = useDoubleClick(
    () => onEdit(task),
    () => onDoubleClick?.(task),
  );
  const done = task.status === "completed";
  const overdue = !done && task.due_date !== null && formatDue(task.due_date, today).includes("overdue");

  const hasDesc = !!task.description && descriptionMode !== "none";
  const showDesc = hasDesc && (descriptionMode === "always" || expanded);

  return (
    <div className={done ? "opacity-50" : ""}>
      <div className="flex items-center gap-3 py-2.5 px-1">
        <button
          onClick={() => (done ? onReopen(task.id) : onComplete(task.id))}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className="shrink-0 w-11 h-11 grid place-items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded-full"
        >
          <span
            className={`w-5 h-5 rounded-full border grid place-items-center transition-colors duration-200 ${
              done
                ? "border-signal bg-signal/20"
                : "border-signal-dim hover:border-signal hover:shadow-[0_0_8px_rgba(63,169,104,0.4)]"
            }`}
          >
            {done && (
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-signal" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
        </button>

        <button
          onClick={onDoubleClick ? handleTitleClick : () => onEdit(task)}
          className="flex-1 min-w-0 text-left rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
          aria-label={`Edit ${task.title}`}
        >
          <p className={`flex items-center gap-2 font-body font-semibold text-base leading-snug ${done ? "line-through" : ""}`}>
            <span className="truncate">{task.title}</span>
            {category && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-data text-[9.5px] tracking-wide uppercase"
                style={{ color: category.color, background: `${category.color}1f`, border: `1px solid ${category.color}55` }}
              >
                {category.name}
              </span>
            )}
          </p>
          <p className="flex items-center gap-2 mt-0.5">
            {task.due_date && (
              <span className={`hud-chip ${overdue ? "hud-chip-amber" : ""}`}>
                {formatDue(task.due_date, today)}
              </span>
            )}
            {task.scheduled_time && (
              <span className="hud-chip hud-chip-signal">⏱ {task.scheduled_time.slice(0, 5)}</span>
            )}
            {/* BUILD_PLAN: scheduled / not-scheduled indicator on every task */}
            <span className={`hud-chip ${task.due_date ? "hud-chip-signal" : "!border-dim/30 !text-dim/70"}`}>
              {task.due_date ? "scheduled" : "not scheduled"}
            </span>
            <span className="font-data text-[0.65rem] text-dim tracking-widest" aria-label={`Priority ${task.priority_weight} of 5`}>
              {"▮".repeat(task.priority_weight)}
              <span className="opacity-30">{"▮".repeat(5 - task.priority_weight)}</span>
            </span>
          </p>
        </button>

        {/* Chevron reveals the description inline without opening the edit modal */}
        {hasDesc && descriptionMode === "chevron" && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide description of ${task.title}` : `Show description of ${task.title}`}
            className="shrink-0 w-9 h-9 grid place-items-center text-dim hover:text-signal cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal"
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {showDesc && (
        <p className="text-dim text-sm leading-snug whitespace-pre-line pl-14 pr-1 pb-2 -mt-1">{task.description}</p>
      )}
    </div>
  );
}
