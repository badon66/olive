import { useState } from "react";
import type { Checkin, Habit } from "../../hooks/useHabits";
import type { Task } from "../../hooks/useTasks";
import { SECTION_ORDER, scheduleSort, type TimeSection } from "../../lib/sections";
import { SectionPencil } from "../SectionPencil";
import { TaskCard } from "../TaskCard";
import { DraggableHabit, DraggableTask, DropZone } from "./TaskDnd";

const SECTION_LABELS: Record<TimeSection, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

type CardProps = {
  today: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
};

type HabitBits = {
  habits: Habit[];
  checkins: Checkin[];
  checkIn: (habitId: string, date: string) => Promise<Checkin | null>;
  uncheck: (habitId: string, date: string) => Promise<void>;
};

// Tasks due today grouped by time_section, plus habits scheduled into a section
// (habit.time_section). Sections are drop targets for both.
export function TodaySchedulePanel({
  dueToday,
  cardProps,
  habitBits,
}: {
  dueToday: Task[];
  cardProps: CardProps;
  habitBits?: HabitBits;
}) {
  const today = cardProps.today;
  const [editMode, setEditMode] = useState(false);
  const habitChecked = (h: Habit) =>
    habitBits?.checkins.some((c) => c.habit_id === h.id && c.date === today && c.completed) ?? false;

  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">
          Today's Schedule
        </h3>
        <span className="flex items-center gap-1.5">
          <span className="hud-chip">{dueToday.length}</span>
          <SectionPencil active={editMode} onToggle={() => setEditMode(!editMode)} label="today's schedule" />
        </span>
      </header>

      {dueToday.length === 0 && <p className="text-dim text-sm py-1.5 mb-1">Clear for today — drag something in.</p>}

      <div className="space-y-2">
        {SECTION_ORDER.map((section) => {
          const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
          const sectionHabits = (habitBits?.habits ?? []).filter((h) => h.time_section === section);
          return (
            <DropZone key={section} id={`section:${section}`} className="border border-signal-dim/15 rounded p-2">
              <p className="font-data text-[11px] text-dim uppercase tracking-widest mb-0.5">
                {SECTION_LABELS[section]}
              </p>
              {items.length === 0 && sectionHabits.length === 0 ? (
                <p className="text-dim/50 text-xs py-1">—</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {sectionHabits.map((h) => {
                    const checked = habitChecked(h);
                    return (
                      <DraggableHabit key={h.id} zone="schedhabit" habit={h}>
                        <div className="flex items-center gap-3 py-1.5">
                          <button
                            onClick={() =>
                              checked ? void habitBits!.uncheck(h.id, today) : void habitBits!.checkIn(h.id, today)
                            }
                            aria-label={checked ? `Uncheck ${h.name}` : `Check off ${h.name}`}
                            className="shrink-0 w-9 h-9 grid place-items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded-full"
                          >
                            <span
                              className={`w-4 h-4 rounded-full border grid place-items-center transition-colors duration-200 ${
                                checked
                                  ? "border-signal bg-signal/20"
                                  : "border-signal-dim hover:border-signal"
                              }`}
                            >
                              {checked && (
                                <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-signal" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                          </button>
                          <span className={`flex-1 min-w-0 truncate font-body text-[15px] ${checked ? "opacity-50 line-through" : ""}`}>
                            {h.name}
                          </span>
                          <span className="hud-chip shrink-0">habit</span>
                        </div>
                      </DraggableHabit>
                    );
                  })}
                  {items.map((t) => (
                    <DraggableTask key={t.id} zone="sched" task={t}>
                      <TaskCard task={t} {...cardProps} editMode={editMode} />
                    </DraggableTask>
                  ))}
                </div>
              )}
            </DropZone>
          );
        })}
      </div>
    </section>
  );
}
