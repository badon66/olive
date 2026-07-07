import { useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import { CATEGORY_LABELS, type Category } from "../lib/categories";

type Props = {
  initial?: Task;
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
};

export function TaskForm({ initial, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "personal");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [priority, setPriority] = useState(initial?.priority_weight ?? 3);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await onSubmit({
      title: title.trim(),
      category,
      due_date: dueDate || null,
      priority_weight: priority,
    });
    setBusy(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end sm:place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit task" : "Add task"}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-panel w-full sm:max-w-md p-5 space-y-4 rounded-b-none sm:rounded-b-lg mb-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
            {initial ? "Edit task" : "New task"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Title *</span>
          <input className="hud-input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Category</span>
          <select className="hud-input cursor-pointer" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-void">
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Due date</span>
          <input className="hud-input" type="date" value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        <fieldset className="space-y-1">
          <legend className="font-data text-xs text-dim uppercase tracking-wider">Priority</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Priority 1 to 5">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
                className={`flex-1 min-h-[44px] rounded border font-data text-sm cursor-pointer transition-colors duration-150 ${
                  priority === p
                    ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(46,255,181,0.25)]"
                    : "border-signal-dim/40 text-dim hover:border-signal-dim"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>

        <button className="hud-button w-full" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add task"}
        </button>
      </form>
    </div>
  );
}
