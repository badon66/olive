import { useMemo, useState } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import { CATEGORY_LABELS, type Category } from "../lib/categories";
import { edmontonToday } from "../lib/dates";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

type Props = {
  tasks: Task[];
  loading: boolean;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
};

export function TaskList({ tasks, loading, addTask, updateTask, completeTask, reopenTask, deleteTask }: Props) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const today = edmontonToday();

  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const completed = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "completed")
        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
        .slice(0, 20),
    [tasks],
  );

  const cardProps = {
    today,
    onComplete: completeTask,
    onReopen: reopenTask,
    onEdit: setEditing,
    onDelete: (id: string) => setConfirmDelete(tasks.find((t) => t.id === id) ?? null),
  };

  if (loading) return <p className="text-dim pulse-live">Loading tasks…</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0 lg:items-start">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
          const group = open.filter((t) => t.category === cat);
          return (
            <section key={cat} className="hud-panel p-4 lg:p-5">
              <header className="flex items-center justify-between mb-1">
                <h2 className="font-display text-xs tracking-[0.25em] uppercase text-signal">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <span className="hud-chip">{group.length}</span>
              </header>
              {group.length === 0 ? (
                <p className="text-dim text-sm py-2">Nothing here. Add one below or tell Olive.</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {group.map((t) => (
                    <TaskCard key={t.id} task={t} {...cardProps} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button className="hud-button w-full" onClick={() => setAdding(true)}>
        + Add task
      </button>

      {completed.length > 0 && (
        <section className="pt-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full text-left font-display text-xs tracking-[0.25em] uppercase text-dim py-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
            aria-expanded={showCompleted}
          >
            {showCompleted ? "▾" : "▸"} Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="divide-y divide-signal-dim/15">
              {completed.map((t) => (
                <TaskCard key={t.id} task={t} {...cardProps} />
              ))}
            </div>
          )}
        </section>
      )}

      {(adding || editing) && (
        <TaskForm
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            if (editing) await updateTask(editing.id, input);
            else await addTask(input);
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6"
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className="hud-panel p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-body">
              Delete <span className="text-signal font-semibold">{confirmDelete.title}</span>?
            </p>
            <div className="flex gap-3">
              <button className="hud-button flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="hud-button flex-1 !border-critical/60 !text-critical hover:!bg-critical/10"
                onClick={async () => {
                  await deleteTask(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
