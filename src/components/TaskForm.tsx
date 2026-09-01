import { useState, type FormEvent } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryRow } from "../hooks/useCategories";
import { SECTION_ORDER, type TimeSection } from "../lib/sections";
import { DatePickerPopup } from "./DatePickerPopup";
import { CandidateDatesGrid } from "./CandidateDatesGrid";
import { Portal } from "./Portal";
import { useEscape } from "./useEscape";

type Props = {
  initial?: Task;
  categories: CategoryRow[];
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
  // Deleting lives inside the item's edit modal (revised editing pattern)
  onDelete?: () => Promise<void>;
  // Presets for scoped adds (category panel "+", the schedule's viewed day, a job)
  defaults?: { category_id?: string; due_date?: string; job_id?: string };
  // Shown as context when the task is being added to a specific job
  jobName?: string;
};

export function TaskForm({ initial, categories, onSubmit, onClose, onDelete, defaults, jobName }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? defaults?.category_id ?? categories[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? defaults?.due_date ?? "");
  // Scheduling mode (BUILD_PLAN). "fixed" is one day; the two flexible modes
  // are mutually exclusive — a DB check constraint enforces the same thing.
  const initialMode: "fixed" | "range" | "pick" =
    initial?.candidate_dates && initial.candidate_dates.length > 0
      ? "pick"
      : initial?.window_start
        ? "range"
        : "fixed";
  const [mode, setMode] = useState<"fixed" | "range" | "pick">(initialMode);
  const [windowStart, setWindowStart] = useState(initial?.window_start ?? "");
  const [windowEnd, setWindowEnd] = useState(initial?.window_end ?? "");
  const [candidateDates, setCandidateDates] = useState<string[]>(initial?.candidate_dates ?? []);
  const [priority, setPriority] = useState(initial?.priority_weight ?? 3);
  const [scheduledTime, setScheduledTime] = useState(initial?.scheduled_time?.slice(0, 5) ?? "");
  const [timeSection, setTimeSection] = useState<TimeSection | "">(initial?.time_section ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ? String(initial.duration_minutes) : "");
  // BUILD_PLAN: on a NEW task the safety net is checked by default; editing an
  // existing task keeps whatever it already had.
  const [carryForward, setCarryForward] = useState(initial ? initial.auto_carry_forward : true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEscape(onClose);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !categoryId) return;
    // Window mode needs BOTH ends, in order — a half-filled range used to sail
    // through to the DB, violate the tasks_window_range_sane constraint, and
    // fail silently: the modal closed and no task existed.
    if (mode === "range") {
      if (!windowStart || !windowEnd) {
        setFormError("A window needs both a From and a To date.");
        return;
      }
      if (windowStart > windowEnd) {
        setFormError("The window's From date must not be after its To date.");
        return;
      }
    }
    setFormError(null);
    setBusy(true);
    try {
      await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId,
      due_date: mode === "fixed" ? dueDate || null : dueDate || null,
      window_start: mode === "range" ? windowStart || null : null,
      window_end: mode === "range" ? windowEnd || null : null,
      candidate_dates: mode === "pick" && candidateDates.length > 0 ? candidateDates : null,
      priority_weight: priority,
      scheduled_time: scheduledTime || null,
      time_section: timeSection || null,
      duration_minutes: duration.trim() ? Math.max(1, Number(duration)) : null,
      auto_carry_forward: carryForward,
      ...(initial ? {} : defaults?.job_id ? { job_id: defaults.job_id } : {}),
    });
    } catch (err) {
      setBusy(false);
      setFormError(err instanceof Error ? err.message : "Saving failed — nothing was created.");
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-void/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit task" : "Add task"}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-modal w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg mb-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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

        {jobName && (
          <p className="font-data text-[11px] text-signal">For job: <span className="text-hud">{jobName}</span></p>
        )}

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Title *</span>
          <input className="hud-input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Description</span>
          <textarea
            className="hud-input min-h-[64px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional — extra detail, shown on the task"
          />
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
          <span className="font-data text-xs text-dim uppercase tracking-wider">When</span>
          {/* Three ways to schedule: one fixed day, a continuous window, or a
              hand-picked set of days. The two flexible modes let the scheduler
              place the task on whichever option is least busy, and the task is
              only overdue once every option is used up (BUILD_PLAN). */}
          <div className="flex gap-1 mb-1.5" role="group" aria-label="Scheduling mode">
            {([
              ["fixed", "Fixed day"],
              ["range", "Window"],
              ["pick", "Pick days"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 h-8 rounded border font-data text-[11px] cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
                  mode === m
                    ? "border-signal bg-signal/15 text-signal"
                    : "border-signal-dim/30 text-dim hover:border-signal/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "fixed" && (
            <DatePickerPopup value={dueDate || null} onChange={(d) => setDueDate(d ?? "")} />
          )}
          {mode === "range" && (
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="font-data text-[10px] text-dim block mb-0.5">From</span>
                <input type="date" className="hud-input w-full" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </label>
              <label className="flex-1">
                <span className="font-data text-[10px] text-dim block mb-0.5">To</span>
                <input type="date" className="hud-input w-full" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </label>
            </div>
          )}
          {mode === "pick" && (
            <CandidateDatesGrid value={candidateDates} onChange={setCandidateDates} />
          )}
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

        {/* Opt-in carry-forward: if not done by its day, surfaces under Today's
            Schedule's "Carryover Tasks" (not a general unfinished-task reminder). */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={carryForward}
            onChange={(e) => setCarryForward(e.target.checked)}
            className="w-5 h-5 accent-signal cursor-pointer"
          />
          <span className="font-body text-sm text-hud">Carry forward if not done</span>
        </label>

        {formError && <p className="font-data text-xs text-critical" role="alert">{formError}</p>}

        <div className="flex gap-3">
          {initial && onDelete && (
            <button
              type="button"
              className="hud-button !border-critical/60 !text-critical hover:!bg-critical/10 px-4"
              disabled={busy}
              onClick={async () => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  return;
                }
                setBusy(true);
                await onDelete();
                setBusy(false);
                onClose();
              }}
            >
              {confirmingDelete ? "Confirm delete?" : "Delete"}
            </button>
          )}
          <button className="hud-button-primary flex-1" disabled={busy || !title.trim() || !categoryId}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}
