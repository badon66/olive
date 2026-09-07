import { useEffect, useState, type FormEvent } from "react";
import type { Reminder, ReminderInput } from "../hooks/useReminders";
import { RECURRENCE_LABELS, RECURRENCE_TYPES, type RecurrenceType } from "../lib/reminders";
import { clampVolume, DEFAULT_SOUND_ID, playSound, SOUNDS, stopSound } from "../lib/sounds";
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
  // Alert policy (BUILD_PLAN): sound, volume, and how insistently it repeats.
  const [soundId, setSoundId] = useState(initial?.sound_id ?? DEFAULT_SOUND_ID);
  const [volume, setVolume] = useState(clampVolume(initial?.volume));
  const [maxRepeats, setMaxRepeats] = useState(String(initial?.max_repeats ?? 10));
  const [repeatSeconds, setRepeatSeconds] = useState(String(initial?.repeat_interval_seconds ?? 20));
  const [busy, setBusy] = useState(false);
  // A preview left ringing after the modal closes would be a bug, not a feature.
  useEffect(() => () => stopSound(soundId), [soundId]);
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
      sound_id: soundId,
      volume: clampVolume(volume),
      // Clamped to the same range the DB check constraint enforces, so a typed
      // value can never fail the insert silently.
      max_repeats: Math.min(100, Math.max(1, Number(maxRepeats) || 10)),
      repeat_interval_seconds: Math.min(3600, Math.max(1, Number(repeatSeconds) || 20)),
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

          {/* ── Alert policy ────────────────────────────────────────────── */}
          <fieldset className="space-y-1.5 pt-1 border-t border-panel-border">
            <legend className="font-data text-xs text-dim uppercase tracking-wider pt-2">Sound</legend>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Notification sound">
              {SOUNDS.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded border pl-3 pr-1.5 py-1 transition-colors duration-200 ${
                    soundId === s.id ? "border-signal bg-signal/10" : "border-signal-dim/40"
                  }`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={soundId === s.id}
                    onClick={() => setSoundId(s.id)}
                    className={`flex-1 text-left min-h-[38px] font-body text-[15px] cursor-pointer ${
                      soundId === s.id ? "text-signal" : "text-dim hover:text-hud"
                    }`}
                  >
                    {s.label}
                  </button>
                  {/* Hear it before committing to it (BUILD_PLAN). Plays at the
                      volume actually configured, so the slider is auditioned too. */}
                  <button
                    type="button"
                    onClick={() => playSound(s.id, volume)}
                    aria-label={`Preview ${s.label}`}
                    title={`Preview ${s.label}`}
                    className="shrink-0 w-9 h-9 grid place-items-center rounded border border-signal/40 text-signal cursor-pointer hover:bg-signal/15 focus-visible:outline-2 focus-visible:outline-signal"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1">
            {label(`Volume — ${Math.round(volume * 100)}%`)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              // Committing the drag auditions the new level, rather than making
              // the user guess what 40% sounds like.
              onMouseUp={() => playSound(soundId, volume)}
              onTouchEnd={() => playSound(soundId, volume)}
              aria-label="Notification volume"
              className="w-full h-11 cursor-pointer accent-[var(--color-signal)]"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex-1 block space-y-1">
              {label("Repeat times")}
              <input className="hud-input" type="number" min="1" max="100" value={maxRepeats} onChange={(e) => setMaxRepeats(e.target.value)} />
            </label>
            <label className="flex-1 block space-y-1">
              {label("Seconds apart")}
              <input className="hud-input" type="number" min="1" max="3600" value={repeatSeconds} onChange={(e) => setRepeatSeconds(e.target.value)} />
            </label>
          </div>
          <p className="text-dim/70 text-xs -mt-1">
            Re-alerts until dismissed, then gives up quietly until the next occurrence.
          </p>

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
