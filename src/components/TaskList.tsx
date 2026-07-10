import { useMemo, useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryRow, CategoryStore } from "../hooks/useCategories";
import { CATEGORY_PALETTE } from "../lib/categories";
import { edmontonToday } from "../lib/dates";
import { SectionPencil } from "./SectionPencil";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

type Props = {
  tasks: Task[];
  loading: boolean;
  categoryStore: CategoryStore;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
};

export function TaskList({ tasks, loading, categoryStore, addTask, updateTask, completeTask, reopenTask, deleteTask }: Props) {
  const { categories } = categoryStore;
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // One pencil per section (v3): which category sections are in edit mode
  const [editSections, setEditSections] = useState<Set<string>>(new Set());
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const today = edmontonToday();

  const toggleEditSection = (key: string) =>
    setEditSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  if (loading || categoryStore.loading) return <p className="text-dim pulse-live">Loading tasks…</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-4 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] lg:gap-6 lg:space-y-0 lg:items-start">
        {categories.map((cat) => {
          const group = open.filter((t) => t.category_id === cat.id);
          const inEdit = editSections.has(cat.id);
          return (
            <section key={cat.id} className="hud-panel p-4 lg:p-5" style={{ borderLeft: `3px solid ${cat.color}` }}>
              <header className="flex items-center justify-between mb-1 gap-2">
                <h2 className="flex items-center gap-2 min-w-0 font-display text-xs tracking-[0.2em] uppercase text-hud">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}` }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{cat.name}</span>
                </h2>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="hud-chip">{group.length}</span>
                  <SectionPencil active={inEdit} onToggle={() => toggleEditSection(cat.id)} label={cat.name} />
                </span>
              </header>
              {group.length === 0 ? (
                <p className="text-dim text-sm py-2">Nothing here. Add one below or tell Olive.</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {group.map((t) => (
                    <TaskCard key={t.id} task={t} {...cardProps} editMode={inEdit} />
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

      {/* Categories management: rename / recolor via per-row pencil, add new */}
      <section className="hud-panel p-4">
        <header className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xs tracking-[0.25em] uppercase text-signal">Categories</h2>
          <button className="hud-chip hud-chip-signal cursor-pointer" onClick={() => setAddingCategory(true)}>
            + new
          </button>
        </header>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded border border-panel-border">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} aria-hidden="true" />
              <span className="font-body text-sm">{c.name}</span>
              <SectionPencil active={editCategory?.id === c.id} onToggle={() => setEditCategory(c)} label={c.name} />
            </span>
          ))}
        </div>
      </section>

      {completed.length > 0 && (
        <section className="pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex-1 text-left font-display text-xs tracking-[0.25em] uppercase text-dim py-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
              aria-expanded={showCompleted}
            >
              {showCompleted ? "▾" : "▸"} Completed ({completed.length})
            </button>
            {showCompleted && (
              <SectionPencil
                active={editSections.has("completed")}
                onToggle={() => toggleEditSection("completed")}
                label="completed tasks"
              />
            )}
          </div>
          {showCompleted && (
            <div className="divide-y divide-signal-dim/15">
              {completed.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  {...cardProps}
                  editMode={editSections.has("completed")}
                  category={categoryStore.byId.get(t.category_id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {(adding || editing) && (
        <TaskForm
          initial={editing ?? undefined}
          categories={categories}
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

      {(editCategory || addingCategory) && (
        <CategoryForm
          initial={editCategory ?? undefined}
          onClose={() => {
            setEditCategory(null);
            setAddingCategory(false);
          }}
          onSubmit={async (name, color) => {
            if (editCategory) await categoryStore.updateCategory(editCategory.id, { name, color });
            else await categoryStore.addCategory(name, color);
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

function CategoryForm({
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
