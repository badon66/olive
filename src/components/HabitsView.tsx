import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Checkin, Habit, HabitStore } from "../hooks/useHabits";
import { edmontonToday } from "../lib/dates";
import { dailyStreak, last7Days, weeklyStreak } from "../lib/streaks";
import { SectionPencil } from "./SectionPencil";
import { DraggableHabit } from "./board/TaskDnd";

export function streakLabel(habit: Habit, checkins: Checkin[], today: string): string {
  const dates = checkins.filter((c) => c.habit_id === habit.id && c.completed).map((c) => c.date);
  return habit.frequency === "daily"
    ? `${dailyStreak(new Set(dates), today)}d`
    : `${weeklyStreak(dates, today)}w`;
}

type Props = HabitStore & { bare?: boolean; draggable?: boolean };

export function HabitsView({ habits, checkins, loading, addHabit, updateHabit, deleteHabit, checkIn, uncheck, saveDetail, bare = false, draggable = false }: Props) {
  const [detailFor, setDetailFor] = useState<Checkin | null>(null);
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [editMode, setEditMode] = useState(false);
  const today = edmontonToday();
  const week = useMemo(() => last7Days(today), [today]);

  const checkinsByHabit = useMemo(() => {
    const m = new Map<string, Checkin[]>();
    for (const c of checkins) {
      if (!c.completed) continue;
      const list = m.get(c.habit_id) ?? [];
      list.push(c);
      m.set(c.habit_id, list);
    }
    return m;
  }, [checkins]);

  const toggleToday = async (habit: Habit) => {
    const todayCheckin = (checkinsByHabit.get(habit.id) ?? []).find((c) => c.date === today);
    if (todayCheckin) {
      setDetailFor(null);
      await uncheck(habit.id, today);
    } else {
      const created = await checkIn(habit.id, today);
      if (created) {
        setNote("");
        setDuration("");
        setDetailFor(created); // offer detail — one tap to skip
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

  if (loading) return <p className="text-dim pulse-live">Loading habits…</p>;

  const rows = (
    <>
      {habits.length > 0 && (
        <div className="flex justify-end -mt-1 -mb-1">
          <SectionPencil active={editMode} onToggle={() => setEditMode(!editMode)} label="weekly tasks" />
        </div>
      )}
      {habits.length === 0 ? (
        <p className="text-dim text-sm py-2">No habits yet. Add one to start a streak.</p>
      ) : (
        <div className="divide-y divide-signal-dim/15">
          {habits.map((h) => {
            const done = checkinsByHabit.get(h.id) ?? [];
            const doneDates = new Set(done.map((c) => c.date));
            const todayCheckin = done.find((c) => c.date === today);
            const label = streakLabel(h, checkins, today);
            const streakActive = !label.startsWith("0");
            const showDetail = detailFor !== null && todayCheckin?.id === detailFor.id;
            // Draggable only inside a DndContext (desktop board) — the wrapper
            // hook would throw on the standalone mobile Habits tab
            const wrap = (row: ReactNode) =>
              draggable ? (
                <DraggableHabit key={h.id} zone="habitlist" habit={h}>
                  {row}
                </DraggableHabit>
              ) : (
                <div key={h.id}>{row}</div>
              );
            return wrap(
              <div className="py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void toggleToday(h)}
                    aria-label={todayCheckin ? `Uncheck ${h.name} for today` : `Check off ${h.name} for today`}
                    className="shrink-0 w-11 h-11 grid place-items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded-full"
                  >
                    <span
                      className={`w-5 h-5 rounded-full border grid place-items-center transition-colors duration-200 ${
                        todayCheckin
                          ? "border-signal bg-signal/20"
                          : "border-signal-dim hover:border-signal hover:shadow-[0_0_8px_rgba(63,169,104,0.4)]"
                      }`}
                    >
                      {todayCheckin && (
                        <svg viewBox="0 0 24 24" className="w-3 h-3 text-signal" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                  </button>

                  <button
                    onClick={() => editMode && setEditing(h)}
                    disabled={!editMode}
                    className={`flex-1 min-w-0 text-left rounded ${
                      editMode ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-signal" : "cursor-default"
                    }`}
                    aria-label={editMode ? `Edit ${h.name}` : h.name}
                  >
                    <p className="font-body font-semibold text-base leading-snug truncate">{h.name}</p>
                    {todayCheckin && (todayCheckin.note || todayCheckin.duration_minutes) && (
                      <p className="text-dim text-xs truncate">
                        {[todayCheckin.note, todayCheckin.duration_minutes ? `${todayCheckin.duration_minutes} min` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </button>

                  <span className="hud-chip shrink-0">{h.frequency}</span>
                  {h.time_section && <span className="hud-chip hud-chip-signal shrink-0">{h.time_section}</span>}
                  <span
                    className={`shrink-0 font-data text-xs tracking-wider ${streakActive ? "text-signal" : "text-dim"}`}
                    aria-label={`Streak ${label}`}
                  >
                    ▮ {label}
                  </span>

                  <span className="hidden sm:flex gap-[3px] shrink-0" aria-hidden="true">
                    {week.map((d) => (
                      <span key={d} className={`w-3.5 h-1.5 ${doneDates.has(d) ? "bg-signal" : "bg-signal/12"}`} />
                    ))}
                  </span>
                </div>

                {showDetail && (
                  <div className="flex items-center gap-2 mt-2 ml-14">
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
                    <button
                      className="hud-button !min-h-[38px] px-3 !border-signal-dim/40 !text-dim"
                      onClick={() => setDetailFor(null)}
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button className="hud-button w-full mt-3" onClick={() => setAdding(true)}>
        + Add habit
      </button>
    </>
  );

  return (
    <div>
      {bare ? rows : <section className="hud-panel p-4">{rows}</section>}

      {(adding || editing) && (
        <HabitForm
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDelete={editing ? () => setConfirmDelete(editing) : undefined}
          onSubmit={async (name, frequency) => {
            if (editing) await updateHabit(editing.id, { name, frequency });
            else await addHabit(name, frequency);
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6"
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete habit"
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
                  await deleteHabit(confirmDelete.id);
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

function HabitForm({
  initial,
  onSubmit,
  onClose,
  onDelete,
}: {
  initial?: Habit;
  onSubmit: (name: string, frequency: "daily" | "weekly") => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekly">(initial?.frequency ?? "daily");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit(name.trim(), frequency);
    setBusy(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end sm:place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit habit" : "Add habit"}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-panel w-full sm:max-w-md p-5 space-y-4 rounded-b-none sm:rounded-b-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">
            {initial ? "Edit habit" : "New habit"}
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

        <fieldset className="space-y-1">
          <legend className="font-data text-xs text-dim uppercase tracking-wider">Frequency</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Frequency">
            {(["daily", "weekly"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={frequency === f}
                onClick={() => setFrequency(f)}
                className={`flex-1 min-h-[44px] rounded border font-data text-sm cursor-pointer transition-colors duration-150 ${
                  frequency === f
                    ? "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                    : "border-signal-dim/40 text-dim hover:border-signal-dim"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-3">
          {onDelete && (
            <button
              type="button"
              className="hud-button !border-critical/60 !text-critical hover:!bg-critical/10 px-4"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
          <button className="hud-button flex-1" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add habit"}
          </button>
        </div>
      </form>
    </div>
  );
}
