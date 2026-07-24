import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { BlockedWindow } from "../../lib/api";
import { SECTION_ORDER, scheduleSort, type TimeSection } from "../../lib/sections";
import { pullForward } from "../../lib/suggest";
import { appearsToday } from "../../lib/weekly";
import { TaskCard } from "../TaskCard";
import { DraggableTask, DraggableWeekly, DropZone } from "./TaskDnd";

const SECTION_LABELS: Record<TimeSection, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
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
  completeDay: (id: string, date: string) => Promise<WeeklyCheckin | null>;
  uncompleteDay: (task: WeeklyTask, date: string) => Promise<void>;
  saveDetail: (checkinId: string, detail: { note: string | null; duration_minutes: number | null }) => Promise<void>;
};

// Tasks due today grouped by time_section, plus weekly tasks that belong today
// (fixed_days on their weekdays; count-mode until the week's target is met).
// Shows today's wake time + blocked windows when a schedule setup exists.
export function TodaySchedulePanel({
  dueToday,
  openTasks,
  cardProps,
  weeklyBits,
  bare = false,
}: {
  dueToday: Task[];
  // All open tasks — needed to find unscheduled pull-forward candidates
  openTasks: Task[];
  cardProps: CardProps;
  weeklyBits?: WeeklyBits;
  // bare: content only — the dashboard's DashSection provides panel + title
  bare?: boolean;
}) {
  const today = cardProps.today;
  const [setup, setSetup] = useState<{ wake_time: string; blocked_windows: BlockedWindow[] } | null>(null);
  // Every check-in offers an optional note/duration — one tap to skip (spec)
  const [detailFor, setDetailFor] = useState<WeeklyCheckin | null>(null);
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState("");

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

  // Pull-forward suggestions: unscheduled tasks filling sparse, unblocked
  // sections. Recomputes when tasks or blocked windows change; the result is a
  // pure function so no memo needed for correctness.
  const pulled = pullForward(openTasks, today, setup?.blocked_windows ?? []);
  const byId = new Map(openTasks.map((t) => [t.id, t]));
  const pulledFor = (section: TimeSection): Task[] =>
    pulled[section].map((id) => byId.get(id)).filter((t): t is Task => !!t);

  const body = (
    <>
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
          const suggestions = pulledFor(section);
          return (
            <DropZone key={section} id={`section:${section}`} className="border border-signal-dim/15 rounded p-2">
              <p className="font-data text-[11px] text-dim uppercase tracking-widest mb-0.5">
                {SECTION_LABELS[section]}
              </p>
              {items.length === 0 && sectionWeekly.length === 0 && suggestions.length === 0 ? (
                <p className="text-dim/50 text-xs py-1">—</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {sectionWeekly.map((t) => {
                    const checked = checkinsFor(t.id).some((c) => c.date === today && c.status === "completed");
                    const showDetail = detailFor !== null && detailFor.weekly_task_id === t.id;
                    return (
                      <DraggableWeekly key={t.id} zone="schedweekly" weekly={t}>
                        <div className="flex items-center gap-3 py-1.5">
                          <button
                            onClick={async () => {
                              if (checked) {
                                setDetailFor(null);
                                await weeklyBits!.uncompleteDay(t, today);
                              } else {
                                const fresh = await weeklyBits!.completeDay(t.id, today);
                                setNote("");
                                setDuration("");
                                if (fresh) setDetailFor(fresh);
                              }
                            }}
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
                        {showDetail && (
                          <div className="flex items-center gap-2 mb-1.5 ml-12">
                            <input
                              className="hud-input flex-1 !min-h-[36px] text-sm"
                              placeholder="note — optional"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              autoFocus
                            />
                            <input
                              className="hud-input w-18 !min-h-[36px] text-sm"
                              type="number"
                              min="1"
                              placeholder="min"
                              value={duration}
                              onChange={(e) => setDuration(e.target.value)}
                              aria-label="Duration in minutes — optional"
                            />
                            <button
                              className="hud-button !min-h-[36px] px-3"
                              onClick={async () => {
                                await weeklyBits!.saveDetail(detailFor!.id, {
                                  note: note.trim() || null,
                                  duration_minutes: duration.trim() ? Math.max(1, Number(duration)) : null,
                                });
                                setDetailFor(null);
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="hud-button !min-h-[36px] px-3 !border-signal-dim/40 !text-dim"
                              onClick={() => setDetailFor(null)}
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </DraggableWeekly>
                    );
                  })}
                  {items.map((t) => (
                    <DraggableTask key={t.id} zone="sched" task={t}>
                      <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} />
                    </DraggableTask>
                  ))}
                  {/* Pull-forward suggestions — visually distinct, never blended
                      with due-today items; dragging one commits it to this section */}
                  {suggestions.map((t) => (
                    <DraggableTask key={`pf-${t.id}`} zone="sched" task={t}>
                      <div className="relative opacity-70">
                        <span className="absolute right-0 top-2 hud-chip !border-signal-dim/40 !text-signal-dim z-10">
                          pulled forward
                        </span>
                        <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} />
                      </div>
                    </DraggableTask>
                  ))}
                </div>
              )}
            </DropZone>
          );
        })}
      </div>
    </>
  );

  if (bare) return body;

  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">
          Today's Schedule
        </h3>
        <span className="hud-chip">{dueToday.length + weeklyToday.length}</span>
      </header>
      {body}
    </section>
  );
}
