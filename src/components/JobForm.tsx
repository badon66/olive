import { useState, type FormEvent } from "react";
import type { CategoryRow } from "../hooks/useCategories";
import type { Job, JobInput } from "../hooks/useJobs";
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from "../lib/jobs";
import { Portal } from "./Portal";

type Props = {
  initial?: Job;
  categories: CategoryRow[];
  onSubmit: (input: JobInput) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
};

export function JobForm({ initial, categories, onSubmit, onClose, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [status, setStatus] = useState<JobStatus>(initial?.status ?? "quoted");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit({
      name: name.trim(),
      category_id: categoryId || null,
      status,
      notes: notes.trim() || null,
    });
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
      aria-label={initial ? "Edit job" : "Add job"}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-modal w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg mb-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
            {initial ? "Edit job" : "New job"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Job name *</span>
          <input
            className="hud-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dennis's driveway"
            required
            autoFocus
          />
        </label>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Header (company/category)</span>
          <select className="hud-input cursor-pointer" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="" className="bg-void">— no header —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-void">
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-1">
          <legend className="font-data text-xs text-dim uppercase tracking-wider">Status</legend>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Job status">
            {JOB_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className={`min-h-[42px] rounded border font-data text-sm cursor-pointer transition-colors duration-150 ${
                  status === s
                    ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                    : "border-signal-dim/40 text-dim hover:border-signal-dim"
                }`}
              >
                {JOB_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Notes</span>
          <textarea
            className="hud-input min-h-[72px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </label>

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
          <button className="hud-button flex-1" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add job"}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}
