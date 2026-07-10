import type { Task } from "../hooks/useTasks";
import { formatDue } from "../lib/dates";

type Props = {
  task: Task;
  today: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  // v3 edit-mode pattern: rows are read-only (complete ring only) until the
  // section's pencil toggles editing on — then title opens the form + delete shows
  editMode?: boolean;
  // Category corner tag (color + name); omit in contexts already grouped by category
  category?: { name: string; color: string };
};

export function TaskCard({ task, today, onComplete, onReopen, onEdit, onDelete, editMode = false, category }: Props) {
  const done = task.status === "completed";
  const overdue = !done && task.due_date !== null && formatDue(task.due_date, today).includes("overdue");

  return (
    <div className={`flex items-center gap-3 py-2.5 px-1 ${done ? "opacity-50" : ""}`}>
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
        onClick={() => editMode && onEdit(task)}
        disabled={!editMode}
        className={`flex-1 min-w-0 text-left rounded ${
          editMode ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-signal" : "cursor-default"
        }`}
        aria-label={editMode ? `Edit ${task.title}` : task.title}
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

      {editMode && (
        <button
          onClick={() => onDelete(task.id)}
          aria-label={`Delete ${task.title}`}
          className="shrink-0 w-11 h-11 grid place-items-center text-dim hover:text-critical cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal rounded-full"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      )}
    </div>
  );
}
