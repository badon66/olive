import { useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryRow } from "../hooks/useCategories";
import { SECTION_ORDER, type TimeSection } from "../lib/sections";
import { DatePickerPopup } from "./DatePickerPopup";

type Props = {
  initial?: Task;
  categories: CategoryRow[];
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
};

export function TaskForm({ initial, categories, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [priority, setPriority] = useState(initial?.priority_weight ?? 3);
  const [scheduledTime, setScheduledTime] = useState(initial?.scheduled_time?.slice(0, 5) ?? "");
  const [timeSection, setTimeSection] = useState<TimeSection | "">(initial?.time_section ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ? String(initial.duration_minutes) : "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !categoryId) return;
    setBusy(true);
    await onSubmit({
      title: title.trim(),
      category_id: categoryId,
      due_date: dueDate || null,
      priority_weight: priority,
      scheduled_time: scheduledTime || null,
      time_section: timeSection || null,
      duration_minutes: duration.trim() ? Math.max(1, Number(duration)) : null,
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
        className="hud-panel w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg mb-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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
          <select className="hud-input cursor-pointer" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-void">
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Due date</span>
          <DatePickerPopup value={dueDate || null} onChange={(d) => setDueDate(d ?? "")} />
        </div>

        <div className="flex gap-3">
          <label className="flex-1 block space-y-1">
            <span className="font-data text-xs text-dim uppercase tracking-wider">Booked time</span>
            <input
              className="hud-input"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              aria-label="Scheduled time — only for fixed appointments"
            />
          </label>
          <label className="flex-1 block space-y-1">
            <span className="font-data text-xs text-dim uppercase tracking-wider">Part of day</span>
            <select
              className="hud-input cursor-pointer"
              value={timeSection}
              onChange={(e) => setTimeSection(e.target.value as TimeSection | "")}
            >
              <option value="" className="bg-void">—</option>
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s} className="bg-void">
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24 block space-y-1">
            <span className="font-data text-xs text-dim uppercase tracking-wider">Mins</span>
            <input
              className="hud-input"
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              aria-label="Estimated duration in minutes"
            />
          </label>
        </div>

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
                    ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                    : "border-signal-dim/40 text-dim hover:border-signal-dim"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>

        <button className="hud-button w-full" disabled={busy || !title.trim() || !categoryId}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add task"}
        </button>
      </form>
    </div>
  );
}
