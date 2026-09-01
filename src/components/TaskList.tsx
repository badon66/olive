import { useMemo, useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryRow, CategoryStore } from "../hooks/useCategories";
import { CATEGORY_PALETTE } from "../lib/categories";
import { edmontonToday } from "../lib/dates";
import { SkeletonRows } from "./Skeleton";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";
import { DropZone } from "./board/TaskDnd";
import { Portal } from "./Portal";
import { useEscape } from "./useEscape";

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
  // Customize mode ON: section headers show "+" adds (tasks into a category,
  // new categories). OFF: clean view — adds via voice or the dashboard.
  customize?: boolean;
  // Tasks sidebar tab: full management view with category/status/scheduled
  // filters over all tasks all-time (not the dashboard's glanceable today).
  filterable?: boolean;
};

type StatusFilter = "open" | "completed" | "all";
type SchedFilter = "all" | "scheduled" | "unscheduled";

// Editing pattern: clicking a task opens its edit modal; clicking a category
// chip opens that category's edit modal — always, no toggle needed.
export function TaskList({ tasks, loading, categoryStore, addTask, updateTask, completeTask, reopenTask, deleteTask, droppableCategories = false, customize = false, filterable = false }: Props) {
  const { categories } = categoryStore;
  const [editing, setEditing] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [addTaskCat, setAddTaskCat] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  // Tasks-tab filters (ignored unless `filterable`)
  const [catFilter, setCatFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [schedFilter, setSchedFilter] = useState<SchedFilter>("all");
  const today = edmontonToday();

  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);

  // Filterable view: the set shown in the category panels honours all filters
  const filtered = useMemo(() => {
    if (!filterable) return open;
    return tasks
      .filter((t) => (statusFilter === "all" ? true : t.status === statusFilter))
      .filter((t) =>
        schedFilter === "all" ? true : schedFilter === "scheduled" ? t.due_date !== null : t.due_date === null,
      );
  }, [filterable, tasks, open, statusFilter, schedFilter]);

  const shownCategories = filterable && catFilter !== "all" ? categories.filter((c) => c.id === catFilter) : categories;
  const displaySet = filterable ? filtered : open;
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

  if (loading || categoryStore.loading)
    return (
      <section className="hud-panel p-4">
        <SkeletonRows count={5} />
      </section>
    );

  const selectCls =
    "hud-input !min-h-[38px] !w-auto text-sm cursor-pointer py-1 pr-7";

  return (
    <div className="space-y-4">
      {filterable && (
        <section className="hud-panel p-3 flex flex-wrap items-center gap-2">
          <span className="font-data text-[11px] text-dim uppercase tracking-wider mr-1">Filter</span>
          <select className={selectCls} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filter by category">
            <option value="all" className="bg-void">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-void">{c.name}</option>
            ))}
          </select>
          <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filter by status">
            <option value="open" className="bg-void">Open</option>
            <option value="completed" className="bg-void">Completed</option>
            <option value="all" className="bg-void">All statuses</option>
          </select>
          <select className={selectCls} value={schedFilter} onChange={(e) => setSchedFilter(e.target.value as SchedFilter)} aria-label="Filter by scheduled">
            <option value="all" className="bg-void">Scheduled &amp; not</option>
            <option value="scheduled" className="bg-void">Scheduled</option>
            <option value="unscheduled" className="bg-void">Not scheduled</option>
          </select>
          {(catFilter !== "all" || statusFilter !== "open" || schedFilter !== "all") && (
            <button
              onClick={() => {
                setCatFilter("all");
                setStatusFilter("open");
                setSchedFilter("all");
              }}
              className="hud-chip cursor-pointer hover:text-signal"
            >
              reset
            </button>
          )}
          <span className="hud-chip ml-auto">{displaySet.length} shown</span>
        </section>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] lg:gap-6 lg:space-y-0 lg:items-start">
        {shownCategories.map((cat) => {
          const group = displaySet.filter((t) => t.category_id === cat.id);
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
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="hud-chip">{group.length}</span>
                  {customize && (
                    <button
                      onClick={() => setAddTaskCat(cat.id)}
                      aria-label={`Add task to ${cat.name}`}
                      className="w-8 h-8 grid place-items-center rounded border border-signal/50 text-signal cursor-pointer hover:bg-signal/15 transition duration-150 focus-visible:outline-2 focus-visible:outline-signal"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  )}
                </span>
              </header>
              {group.length === 0 ? (
                <p className="text-dim text-sm py-2">Nothing here. Tell Olive, or turn on the pencil and press +.</p>
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
          {customize && (
            <button className="hud-chip hud-chip-signal cursor-pointer" onClick={() => setAddingCategory(true)}>
              + new
            </button>
          )}
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

      {/* In filterable mode the status filter governs completed visibility, so
          the standalone Completed collapsible is hidden to avoid duplication */}
      {!filterable && completed.length > 0 && (
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

      {addingCategory && (
        <CategoryForm
          onClose={() => setAddingCategory(false)}
          onSubmit={async (name, color) => {
            await categoryStore.addCategory(name, color);
          }}
        />
      )}

      {addTaskCat && (
        <TaskForm
          categories={categories}
          defaults={{ category_id: addTaskCat }}
          onClose={() => setAddTaskCat(null)}
          onSubmit={async (input) => {
            await addTask(input);
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
  useEscape(onClose);
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
    <Portal>
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-void/85 backdrop-blur-sm p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit category" : "New category"}
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="hud-modal w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
            {initial ? "Edit category" : "New category"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
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
    </Portal>
  );
}
