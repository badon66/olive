import { useState, type FormEvent } from "react";
import type { Reminder, ReminderInput } from "../hooks/useReminders";
import { RECURRENCE_LABELS, RECURRENCE_TYPES, type RecurrenceType } from "../lib/reminders";
import { Portal } from "./Portal";
import { useEscape } from "./useEscape";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function ReminderForm({
  initial,
  onSubmit,
  onClose,
  onDelete,
}: {
  initial?: Reminder;
  onSubmit: (input: ReminderInput) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [type, setType] = useState<RecurrenceType>(initial?.recurrence_type ?? "one_time");
  // one_time is stored as an instant; the input edits it as local wall time
  const [fireAt, setFireAt] = useState(initial?.fire_at ? toLocalInput(initial.fire_at) : "");
  const [intervalMinutes, setIntervalMinutes] = useState(String(initial?.interval_minutes ?? 30));
  const [days, setDays] = useState<number[]>(initial?.days_of_week ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(String(initial?.day_of_month ?? 1));
  const [timeOfDay, setTimeOfDay] = useState(initial?.time_of_day?.slice(0, 5) ?? "09:00");
  const [busy, setBusy] = useState(false);
  useEscape(onClose);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const valid =
    name.trim() !== "" &&
    (type !== "one_time" || fireAt !== "") &&
    (type !== "interval" || Number(intervalMinutes) > 0) &&
    (type !== "weekly" || days.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    // Only the fields that matter for the chosen shape are sent; the rest are
    // nulled so a switched type can't leave stale values behind.
    await onSubmit({
      name: name.trim(),
      message: message.trim() || null,
      recurrence_type: type,
      fire_at: type === "one_time" ? new Date(fireAt).toISOString() : null,
      interval_minutes: type === "interval" ? Math.max(1, Number(intervalMinutes)) : null,
      days_of_week: type === "weekly" ? [...days].sort((a, b) => a - b) : null,
      day_of_month: type === "monthly" ? Math.min(31, Math.max(1, Number(dayOfMonth))) : null,
      time_of_day: type === "daily" || type === "weekly" || type === "monthly" ? timeOfDay : null,
    });
    setBusy(false);
    onClose();
  };

  const label = (t: string) => <span className="font-data text-xs text-dim uppercase tracking-wider">{t}</span>;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-void/85 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit reminder" : "Add reminder"}
      >
        <form
          onSubmit={submit}
          onClick={(e) => e.stopPropagation()}
          className="hud-modal w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
              {initial ? "Edit reminder" : "New reminder"}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <label className="block space-y-1">
            {label("Name *")}
            <input className="hud-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>

          <label className="block space-y-1">
            {label("Message")}
            <input className="hud-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="optional" />
          </label>

          <fieldset className="space-y-1">
            <legend className="font-data text-xs text-dim uppercase tracking-wider">Repeats</legend>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Recurrence type">
              {RECURRENCE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={`min-h-[42px] rounded border font-data text-[13px] cursor-pointer transition-colors duration-200 ${
                    type === t
                      ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                      : "border-signal-dim/40 text-dim hover:border-signal-dim"
                  }`}
                >
                  {RECURRENCE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>

          {type === "one_time" && (
            <label className="block space-y-1">
              {label("When *")}
              <input className="hud-input" type="datetime-local" value={fireAt} onChange={(e) => setFireAt(e.target.value)} required />
            </label>
          )}

          {type === "interval" && (
            <label className="block space-y-1">
              {label("Every (minutes) *")}
              <input className="hud-input" type="number" min="1" value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} required />
            </label>
          )}

          {type === "weekly" && (
            <fieldset className="space-y-1">
              <legend className="font-data text-xs text-dim uppercase tracking-wider">Which days? (Mon–Sun) *</legend>
              <div className="flex gap-1.5">
                {DAY_LETTERS.map((letter, d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    aria-label={`Day ${d}`}
                    onClick={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}
                    className={`flex-1 min-h-[44px] rounded border font-data text-sm cursor-pointer transition-colors duration-200 ${
                      days.includes(d)
                        ? "border-signal text-signal bg-signal/10"
                        : "border-signal-dim/40 text-dim hover:border-signal-dim"
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {type === "monthly" && (
            <label className="block space-y-1">
              {label("Day of month *")}
              <input className="hud-input" type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} required />
              <span className="text-dim/70 text-xs">Months without this day are skipped, not shifted.</span>
            </label>
          )}

          {(type === "daily" || type === "weekly" || type === "monthly") && (
            <label className="block space-y-1">
              {label("Time *")}
              <input className="hud-input" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
            </label>
          )}

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
            <button className="hud-button-primary flex-1" disabled={busy || !valid}>
              {busy ? "Saving…" : initial ? "Save changes" : "Add reminder"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

// ISO instant → value for <input type="datetime-local"> in Edmonton local time
function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
