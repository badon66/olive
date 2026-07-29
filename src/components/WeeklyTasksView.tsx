import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { WeeklyCheckin, WeeklyStore, WeeklyTask } from "../hooks/useWeeklyTasks";
import { edmontonToday, weekRangeLabel } from "../lib/dates";
import { SECTION_ORDER } from "../lib/sections";
import { cubeStates, progress, weekDates, type CubeState } from "../lib/weekly";
import { DraggableWeekly } from "./board/TaskDnd";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_ABBRS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// Short M/D for a cube's date label, e.g. "7/21".
function cubeDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

export function recurrenceLabel(t: WeeklyTask): string {
  if (t.recurrence_mode === "count") return `${t.target_per_week ?? 0}×/week`;
  const days = (t.scheduled_days ?? []).length === 7 ? "every day" : (t.scheduled_days ?? []).map((d) => DAY_LETTERS[d]).join(" ");
  return days || "no days";
}

function progressNote(t: WeeklyTask, states: CubeState[]): string {
  const p = progress(t, states);
  const parts = [
    t.recurrence_mode === "count" ? `Target: ${p.target}×/week` : `Target: ${p.target} fixed day${p.target === 1 ? "" : "s"}`,
    `Planned: ${p.planned}`,
    `Completed: ${p.completed}`,
  ];
  if (p.toPlan > 0) parts.push(`${p.toPlan} more to plan`);
  return parts.join(" · ");
}

type Props = WeeklyStore & { bare?: boolean; draggable?: boolean; customize?: boolean };

export function WeeklyTasksView({
  weeklyTasks,
  checkins,
  loading,
  updateWeeklyTask,
  deleteWeeklyTask,
  planDay,
  completeDay,
  unplanDay,
  uncompleteDay,
  saveDetail,
  bare = false,
  draggable = false,
  customize = false,
}: Props) {
  const [detailFor, setDetailFor] = useState<WeeklyCheckin | null>(null);
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState("");
  const [editing, setEditing] = useState<WeeklyTask | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WeeklyTask | null>(null);
  const today = edmontonToday();
  const week = useMemo(() => weekDates(today), [today]);

  const checkinsByTask = useMemo(() => {
    const m = new Map<string, WeeklyCheckin[]>();
    for (const c of checkins) {
      const list = m.get(c.weekly_task_id) ?? [];
      list.push(c);
      m.set(c.weekly_task_id, list);
    }
    return m;
  }, [checkins]);

  // Cube tap, gated by the top-corner pencil (BUILD_PLAN):
  //  • pencil OFF (default): click marks that day complete (toggle).
  //  • pencil ON (add/edit mode): click edits/moves — fixed-days toggles that
  //    weekday in/out of scheduled_days; count-mode plans/unplans that day.
  const onCube = async (t: WeeklyTask, date: string, state: CubeState, weekday: number) => {
    if (customize) {
      if (t.recurrence_mode === "fixed_days") {
        const cur = t.scheduled_days ?? [];
        const next = cur.includes(weekday) ? cur.filter((d) => d !== weekday) : [...cur, weekday].sort((a, b) => a - b);
        await updateWeeklyTask(t.id, { scheduled_days: next });
      } else {
        const hasRow = (checkinsByTask.get(t.id) ?? []).some((c) => c.date === date);
        if (hasRow) await unplanDay(t.id, date);
        else await planDay(t.id, date);
      }
      return;
    }
    // Pencil OFF: mark this day complete (or undo it).
    if (state === "completed") {
      setDetailFor(null);
      await uncompleteDay(t, date);
    } else {
      // completeDay returns the written row — the render-time checkin list is
      // stale here and would miss a brand-new checkin
      const fresh = await completeDay(t.id, date);
      if (date === today) {
        setNote("");
        setDuration("");
        if (fresh) setDetailFor(fresh); // offer detail on today's completion — one tap to skip
      }
    }
  };

  const saveDetailNow = async () => {
    if (!detailFor) return;
    await saveDetail(detailFor.id, {
      note: note.trim() || null,
      duration_minutes: duration.trim() ? Math.max(1, Number(duration)) : null,
    });
    setDetailFor(null);
  };

  if (loading) return <p className="text-dim pulse-live">Loading weekly tasks…</p>;

  const rows = (
    <>
      {/* Fixed Monday–Sunday week; header shows the calendar range (BUILD_PLAN) */}
      <p className="font-data text-[11px] text-dim uppercase tracking-widest mb-2">{weekRangeLabel(week[0], week[6])}</p>
      {weeklyTasks.length === 0 ? (
        <p className="text-dim text-sm py-2">No weekly tasks yet. Use the pencil menu to add one.</p>
      ) : (
        <div className="divide-y divide-signal-dim/15">
          {weeklyTasks.map((t) => {
            const rowsFor = checkinsByTask.get(t.id) ?? [];
            const states = cubeStates(t, rowsFor, today);
            const todayCheckin = rowsFor.find((c) => c.date === today);
            const showDetail = detailFor !== null && todayCheckin?.id === detailFor.id;
            const body = (
              <div className="py-2.5">
                {/* Single row: name (+ chips) on the left, the 7 square cubes on
                    the right. Cubes stay large but genuinely square (w-14 h-14). */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setEditing(t)}
                      className="min-w-0 text-left rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
                      aria-label={`Edit ${t.name}`}
                    >
                      <p className="font-body font-semibold text-base leading-snug truncate">{t.name}</p>
                    </button>
                    <span className="hud-chip shrink-0">{recurrenceLabel(t)}</span>
                    {t.time_section && <span className="hud-chip hud-chip-signal shrink-0">{t.time_section}</span>}
                  </div>

                  <div className="flex gap-1.5 shrink-0" role="group" aria-label={`${t.name} week`}>
                    {week.map((date, i) => {
                      const state = states[i];
                      return (
                        <button
                          key={date}
                          onClick={() => void onCube(t, date, state, i)}
                          aria-label={`${t.name} ${DAY_ABBRS[i]} ${cubeDate(date)}: ${state}`}
                          title={
                            customize
                              ? t.recurrence_mode === "fixed_days"
                                ? `${DAY_ABBRS[i]} — click to ${(t.scheduled_days ?? []).includes(i) ? "remove from" : "add to"} schedule`
                                : `${DAY_ABBRS[i]} — click to plan / unplan`
                              : `${DAY_ABBRS[i]} — click to mark ${state === "completed" ? "not done" : "done"}`
                          }
                          className={`w-14 h-14 shrink-0 rounded-md flex flex-col items-center justify-center gap-0.5 font-data cursor-pointer transition-all duration-150 border ${
                            state === "completed"
                              ? "bg-signal-dim border-signal text-hud shadow-[0_0_10px_rgba(63,169,104,0.45)]"
                              : state === "planned"
                                ? "bg-signal/15 border-signal/45 text-signal"
                                : "bg-transparent border-panel-border text-dim/60 hover:border-signal/40"
                          } ${date === today ? "ring-1 ring-hud/50" : ""}`}
                        >
                          <span className="text-[10px] tracking-wide leading-none">{DAY_ABBRS[i]}</span>
                          <span className="text-[11px] leading-none mt-0.5">{cubeDate(date)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Progress note: numbers always add up (planned + completed + to-plan = target) */}
                <p className="font-data text-[11px] text-dim mt-1">{progressNote(t, states)}</p>

                {showDetail && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      className="hud-input flex-1 !min-h-[38px] text-sm"
                      placeholder="note — optional"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="hud-input w-20 !min-h-[38px] text-sm"
                      type="number"
                      min="1"
                      placeholder="min"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      aria-label="Duration in minutes — optional"
                    />
                    <button className="hud-button !min-h-[38px] px-3" onClick={() => void saveDetailNow()}>
                      Save
                    </button>
                    <button className="hud-button !min-h-[38px] px-3 !border-signal-dim/40 !text-dim" onClick={() => setDetailFor(null)}>
                      Skip
                    </button>
                  </div>
                )}
              </div>
            );
            return draggable ? (
              <DraggableWeekly key={t.id} zone="weeklylist" weekly={t}>
                {body}
              </DraggableWeekly>
            ) : (
              <div key={t.id}>{body}</div>
            );
          })}
        </div>
      )}

    </>
  );

  return (
    <div>
      {bare ? rows : <section className="hud-panel p-4">{rows}</section>}

      {editing && (
        <WeeklyTaskForm
          initial={editing}
          onClose={() => setEditing(null)}
          onDelete={() => setConfirmDelete(editing)}
          onSubmit={async (input) => {
            await updateWeeklyTask(editing.id, input);
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6"
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete weekly task"
        >
          <div className="hud-panel p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-body">
              Delete <span className="text-signal font-semibold">{confirmDelete.name}</span>? Its history goes too.
            </p>
            <div className="flex gap-3">
              <button className="hud-button flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="hud-button flex-1 !border-critical/60 !text-critical hover:!bg-critical/10"
                onClick={async () => {
                  await deleteWeeklyTask(confirmDelete.id);
                  setConfirmDelete(null);
                  setEditing(null);
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

export function WeeklyTaskForm({
  initial,
  onSubmit,
  onClose,
  onDelete,
}: {
  initial?: WeeklyTask;
  onSubmit: (input: {
    name: string;
    recurrence_mode: "count" | "fixed_days";
    target_per_week: number | null;
    scheduled_days: number[] | null;
    time_section: WeeklyTask["time_section"];
  }) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mode, setMode] = useState<"count" | "fixed_days">(initial?.recurrence_mode ?? "count");
  const [target, setTarget] = useState(initial?.target_per_week ?? 3);
  const [days, setDays] = useState<number[]>(initial?.scheduled_days ?? []);
  const [section, setSection] = useState<WeeklyTask["time_section"] | "">(initial?.time_section ?? "");
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const valid = name.trim() && (mode === "count" || days.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    await onSubmit({
      name: name.trim(),
      recurrence_mode: mode,
      target_per_week: mode === "count" ? target : null,
      scheduled_days: mode === "fixed_days" ? days : null,
      time_section: section || null,
    });
    setBusy(false);
    onClose();
  };

  const label = (children: ReactNode) => (
    <span className="font-data text-xs text-dim uppercase tracking-wider">{children}</span>
  );

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end sm:place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit weekly task" : "Add weekly task"}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-panel w-full sm:max-w-md p-5 space-y-4 rounded-b-none sm:rounded-b-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
            {initial ? "Edit weekly task" : "New weekly task"}
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

        {/* Which mode fits? A count with any days working, or specific fixed days */}
        <fieldset className="space-y-1">
          <legend className="font-data text-xs text-dim uppercase tracking-wider">How does it repeat?</legend>
          <div className="flex gap-1.5" role="radiogroup">
            {(
              [
                ["count", "X times a week"],
                ["fixed_days", "Specific days"],
              ] as const
            ).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 min-h-[44px] rounded border font-body text-sm cursor-pointer transition-colors duration-150 ${
                  mode === m
                    ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                    : "border-signal-dim/40 text-dim hover:border-signal-dim"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "count" ? (
          <fieldset className="space-y-1">
            <legend className="font-data text-xs text-dim uppercase tracking-wider">Times per week</legend>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Times per week">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={target === n}
                  onClick={() => setTarget(n)}
                  className={`flex-1 min-h-[44px] rounded border font-data text-sm cursor-pointer transition-colors duration-150 ${
                    target === n
                      ? "border-signal text-signal bg-signal/10"
                      : "border-signal-dim/40 text-dim hover:border-signal-dim"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="space-y-1">
            <legend className="font-data text-xs text-dim uppercase tracking-wider">Which days? (Mon–Sun)</legend>
            <div className="flex gap-1.5">
              {DAY_LETTERS.map((letter, d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={`flex-1 min-h-[44px] rounded border font-data text-sm cursor-pointer transition-colors duration-150 ${
                    days.includes(d)
                      ? "border-signal text-signal bg-signal/10"
                      : "border-signal-dim/40 text-dim hover:border-signal-dim"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
            <button type="button" className="font-data text-[11px] text-dim underline underline-offset-4 cursor-pointer" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
              every day
            </button>
          </fieldset>
        )}

        <label className="block space-y-1">
          {label("Part of day")}
          <select
            className="hud-input cursor-pointer"
            value={section ?? ""}
            onChange={(e) => setSection((e.target.value || null) as WeeklyTask["time_section"])}
          >
            <option value="" className="bg-void">—</option>
            {SECTION_ORDER.map((s) => (
              <option key={s} value={s} className="bg-void">
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          {onDelete && (
            <button type="button" className="hud-button !border-critical/60 !text-critical hover:!bg-critical/10 px-4" onClick={onDelete}>
              Delete
            </button>
          )}
          <button className="hud-button flex-1" disabled={busy || !valid}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add weekly task"}
          </button>
        </div>
      </form>
    </div>
  );
}
