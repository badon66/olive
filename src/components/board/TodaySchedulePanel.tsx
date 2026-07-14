import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { BlockedWindow } from "../../lib/api";
import { SECTION_ORDER, scheduleSort, type TimeSection } from "../../lib/sections";
import { appearsToday } from "../../lib/weekly";
import { TaskCard } from "../TaskCard";
import { DraggableTask, DraggableWeekly, DropZone } from "./TaskDnd";

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
  categoryOf?: (task: Task) => { name: string; color: string } | undefined;
};

type WeeklyBits = {
  weeklyTasks: WeeklyTask[];
  checkins: WeeklyCheckin[];
  completeDay: (id: string, date: string) => Promise<void>;
  uncompleteDay: (task: WeeklyTask, date: string) => Promise<void>;
};

// Tasks due today grouped by time_section, plus weekly tasks that belong today
// (fixed_days on their weekdays; count-mode until the week's target is met).
// Shows today's wake time + blocked windows when a schedule setup exists.
export function TodaySchedulePanel({
  dueToday,
  cardProps,
  weeklyBits,
}: {
  dueToday: Task[];
  cardProps: CardProps;
  weeklyBits?: WeeklyBits;
}) {
  const today = cardProps.today;
  const [setup, setSetup] = useState<{ wake_time: string; blocked_windows: BlockedWindow[] } | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("daily_schedule_setup")
      .select("wake_time, blocked_windows")
      .eq("date", today)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) {
          setSetup(
            data ? { wake_time: data.wake_time, blocked_windows: (data.blocked_windows ?? []) as BlockedWindow[] } : null,
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [today]);

  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  const weeklyToday = (weeklyBits?.weeklyTasks ?? []).filter((t) => appearsToday(t, checkinsFor(t.id), today));

  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">
          Today's Schedule
        </h3>
        <span className="hud-chip">{dueToday.length + weeklyToday.length}</span>
      </header>

      {setup && (
        <p className="flex flex-wrap gap-1.5 mb-2">
          <span className="hud-chip hud-chip-signal">wake {setup.wake_time.slice(0, 5)}</span>
          {setup.blocked_windows.map((w, i) => (
            <span key={i} className="hud-chip hud-chip-amber">
              ⛔ {w.start}–{w.end} {w.label}
            </span>
          ))}
        </p>
      )}

      {dueToday.length === 0 && weeklyToday.length === 0 && (
        <p className="text-dim text-sm py-1.5 mb-1">Clear for today — drag something in.</p>
      )}

      <div className="space-y-2">
        {SECTION_ORDER.map((section) => {
          const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
          const sectionWeekly = weeklyToday.filter((t) => (t.time_section ?? "anytime") === section);
          return (
            <DropZone key={section} id={`section:${section}`} className="border border-signal-dim/15 rounded p-2">
              <p className="font-data text-[11px] text-dim uppercase tracking-widest mb-0.5">
                {SECTION_LABELS[section]}
              </p>
              {items.length === 0 && sectionWeekly.length === 0 ? (
                <p className="text-dim/50 text-xs py-1">—</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {sectionWeekly.map((t) => {
                    const checked = checkinsFor(t.id).some((c) => c.date === today && c.status === "completed");
                    return (
                      <DraggableWeekly key={t.id} zone="schedweekly" weekly={t}>
                        <div className="flex items-center gap-3 py-1.5">
                          <button
                            onClick={() =>
                              checked ? void weeklyBits!.uncompleteDay(t, today) : void weeklyBits!.completeDay(t.id, today)
                            }
                            aria-label={checked ? `Uncheck ${t.name}` : `Check off ${t.name}`}
                            className="shrink-0 w-9 h-9 grid place-items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded-full"
                          >
                            <span
                              className={`w-4 h-4 rounded-full border grid place-items-center transition-colors duration-200 ${
                                checked ? "border-signal bg-signal/20" : "border-signal-dim hover:border-signal"
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
                            {t.name}
                          </span>
                          <span className="hud-chip shrink-0">weekly</span>
                        </div>
                      </DraggableWeekly>
                    );
                  })}
                  {items.map((t) => (
                    <DraggableTask key={t.id} zone="sched" task={t}>
                      <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} />
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
