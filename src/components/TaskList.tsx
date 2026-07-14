import { useMemo, useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryRow, CategoryStore } from "../hooks/useCategories";
import { CATEGORY_PALETTE } from "../lib/categories";
import { edmontonToday } from "../lib/dates";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";
import { DropZone } from "./board/TaskDnd";

type Props = {
  tasks: Task[];
  loading: boolean;
  categoryStore: CategoryStore;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  // Only when rendered inside a TaskDndProvider (dashboard): category panels
  // become drop targets for weekly-task → task conversion
  droppableCategories?: boolean;
};

// Revised editing pattern: no per-section pencils, no scattered add buttons.
// Clicking a task opens its edit modal; clicking a category chip opens that
// category's edit modal. Adding anything happens via the global pencil menu.
export function TaskList({ tasks, loading, categoryStore, updateTask, completeTask, reopenTask, deleteTask, droppableCategories = false }: Props) {
  const { categories } = categoryStore;
  const [editing, setEditing] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
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
  };

  if (loading || categoryStore.loading) return <p className="text-dim pulse-live">Loading tasks…</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-4 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] lg:gap-6 lg:space-y-0 lg:items-start">
        {categories.map((cat) => {
          const group = open.filter((t) => t.category_id === cat.id);
          const panel = (
            <section className="hud-panel p-4 lg:p-5" style={{ borderLeft: `3px solid ${cat.color}` }}>
              <header className="flex items-center justify-between mb-1 gap-2">
                <h2 className="flex items-center gap-2 min-w-0 font-display text-xs tracking-[0.2em] uppercase text-hud">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}` }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{cat.name}</span>
                </h2>
                <span className="hud-chip shrink-0">{group.length}</span>
              </header>
              {group.length === 0 ? (
                <p className="text-dim text-sm py-2">Nothing here. Tell Olive or use the pencil menu.</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {group.map((t) => (
                    <TaskCard key={t.id} task={t} {...cardProps} />
                  ))}
                </div>
              )}
            </section>
          );
          return droppableCategories ? (
            <DropZone key={cat.id} id={`cat:${cat.id}`}>
              {panel}
            </DropZone>
          ) : (
            <div key={cat.id}>{panel}</div>
          );
        })}
      </div>

      {/* Categories: click one to rename/recolor (its own scoped edit modal) */}
      <section className="hud-panel p-4">
        <header className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xs tracking-[0.25em] uppercase text-signal">Categories</h2>
        </header>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditCategory(c)}
              aria-label={`Edit category ${c.name}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-panel-border cursor-pointer hover:border-signal/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} aria-hidden="true" />
              <span className="font-body text-sm">{c.name}</span>
            </button>
          ))}
        </div>
      </section>

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
                <TaskCard key={t.id} task={t} {...cardProps} category={categoryStore.byId.get(t.category_id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {editing && (
        <TaskForm
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateTask(editing.id, input);
          }}
          onDelete={async () => {
            await deleteTask(editing.id);
          }}
        />
      )}

      {editCategory && (
        <CategoryForm
          initial={editCategory}
          onClose={() => setEditCategory(null)}
          onSubmit={async (name, color) => {
            await categoryStore.updateCategory(editCategory.id, { name, color });
          }}
        />
      )}
    </div>
  );
}

export function CategoryForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: CategoryRow;
  onSubmit: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? CATEGORY_PALETTE[0]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit(name.trim(), color);
    setBusy(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit category" : "New category"}
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="hud-panel w-full max-w-sm p-5 space-y-4">
        <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
          {initial ? "Edit category" : "New category"}
        </h2>
        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Name *</span>
          <input className="hud-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <div className="space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Color</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={`w-9 h-9 rounded-full cursor-pointer transition-transform duration-150 ${
                  color === c ? "scale-110 ring-2 ring-hud" : "hover:scale-105"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <button className="hud-button w-full" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add category"}
        </button>
      </form>
    </div>
  );
}
