import { useState, type ReactNode } from "react";
import type { Task } from "../../hooks/useTasks";
import { formatDue } from "../../lib/dates";
import { DraggableTask, DropZone } from "./TaskDnd";

type Props = {
  orderedTasks: Task[];
  today: string;
  onEdit: (t: Task) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  manualOrder: boolean;
  headerExtra?: ReactNode;
  categoryOf?: (t: Task) => { name: string; color: string } | undefined;
};

// Collapsible dropdown, collapsed by default. Overdue tasks are folded in at
// the top (never their own section) and drive the summary line.
export function PrioritiesPanel({ orderedTasks, today, onEdit, onMove, manualOrder, headerExtra, categoryOf }: Props) {
  const [open, setOpen] = useState(false);

  const isOverdue = (t: Task) => t.due_date !== null && t.due_date < today;
  // Partition keeps overdue pinned first regardless of manual order
  const display = [...orderedTasks.filter(isOverdue), ...orderedTasks.filter((t) => !isOverdue(t))];
  const overdueCount = display.filter(isOverdue).length;
  const dueTodayCount = orderedTasks.filter((t) => t.due_date === today).length;

  const summary =
    orderedTasks.length === 0
      ? "nothing queued"
      : [
          overdueCount > 0 ? `${overdueCount} overdue` : null,
          dueTodayCount > 0 ? `${dueTodayCount} today` : null,
          overdueCount === 0 && dueTodayCount === 0 ? `${orderedTasks.length} queued` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <section className={`hud-panel p-4 ${overdueCount > 0 ? "!border-amber/40" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded min-h-[44px]"
      >
        <span className="flex items-baseline gap-3 min-w-0">
          <span className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal shrink-0">
            Priorities
          </span>
          <span className={`text-sm truncate ${overdueCount > 0 ? "text-amber" : "text-dim"}`}>{summary}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {headerExtra}
          <svg
            viewBox="0 0 24 24"
            className={`w-4 h-4 text-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <ol className="mt-2">
          {display.map((t, i) => {
            const overdue = isOverdue(t);
            return (
              <li key={t.id}>
                <DropZone id={`prio:${t.id}`}>
                  <DraggableTask zone="prio" task={t}>
                    <div
                      className={`flex items-center gap-3 py-2 border-b border-signal-dim/15 last:border-b-0 ${
                        overdue ? "border-l-2 !border-l-amber/60 pl-2" : ""
                      }`}
                    >
                      <span className="font-data text-xs text-signal/70 w-5 text-right shrink-0">{i + 1}</span>
                      <button
                        onClick={() => onEdit(t)}
                        className="flex-1 min-w-0 truncate text-left font-body font-medium text-[15px] cursor-pointer hover:text-signal transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal rounded"
                      >
                        {t.title}
                      </button>
                      {(() => {
                        const cat = categoryOf?.(t);
                        return cat ? (
                          <span
                            className="shrink-0 hidden sm:inline-flex items-center px-1.5 py-px rounded-sm font-data text-[9.5px] tracking-wide uppercase"
                            style={{ color: cat.color, background: `${cat.color}1f`, border: `1px solid ${cat.color}55` }}
                          >
                            {cat.name}
                          </span>
                        ) : null;
                      })()}
                      {t.due_date && (
                        <span className={`hud-chip ${overdue ? "hud-chip-amber" : ""}`}>
                          {formatDue(t.due_date, today)}
                        </span>
                      )}
                      <span className="flex shrink-0">
                        <button
                          onClick={() => onMove(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${t.title} up`}
                          className="w-8 h-8 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m18 15-6-6-6 6" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onMove(i, 1)}
                          disabled={i === display.length - 1}
                          aria-label={`Move ${t.title} down`}
                          className="w-8 h-8 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  </DraggableTask>
                </DropZone>
              </li>
            );
          })}
        </ol>
      )}

      {open && manualOrder && <p className="mt-2 font-data text-[11px] text-dim">your order — held for today</p>}
    </section>
  );
}
