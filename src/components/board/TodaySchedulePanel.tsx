import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { BlockedWindow } from "../../lib/api";
import { formatDue } from "../../lib/dates";
import { partitionSchedule, SCHEDULE_SLOTS, SECTION_ORDER, scheduleSort, sectionClockLabel, type TimeSection } from "../../lib/sections";
import { pullForward } from "../../lib/suggest";
import { appearsToday, cubeStates, progress } from "../../lib/weekly";
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

// Previous-day navigation (BUILD_PLAN): step the detailed schedule back up to 3
// days. Supplied by the dashboard; `historical` flips the panel to a read-back
// view of that past day (no pull-forward, weekly, or nudges).
export type DayNav = {
  label: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  historical: boolean;
};

// A single expandable nudge button (Unplanned Weekly Tasks / Carryover Tasks).
function NudgeButton({ label, count, open, onClick }: { label: string; count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 h-7 rounded-md border font-data text-[11px] cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
        open ? "border-amber/60 bg-amber/10 text-amber" : "border-amber/40 text-amber hover:bg-amber/10"
      }`}
    >
      <svg viewBox="0 0 24 24" className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
      {label}
      <span className="px-1.5 rounded bg-amber/20 text-amber">{count}</span>
    </button>
  );
}

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
  carryover = [],
  bare = false,
  dayNav,
}: {
  dueToday: Task[];
  // All open tasks — needed to find unscheduled pull-forward candidates
  openTasks: Task[];
  cardProps: CardProps;
  weeklyBits?: WeeklyBits;
  // One-off tasks that opted into auto_carry_forward and went overdue
  carryover?: Task[];
  // bare: content only — the dashboard's DashSection provides panel + title
  bare?: boolean;
  // Previous-day stepper (dashboard only); absent = plain today-only panel
  dayNav?: DayNav;
}) {
  const today = cardProps.today;
  const historical = dayNav?.historical ?? false;
  const [setup, setSetup] = useState<{ wake_time: string; blocked_windows: BlockedWindow[] } | null>(null);
  // Every check-in offers an optional note/duration — one tap to skip (spec)
  const [detailFor, setDetailFor] = useState<WeeklyCheckin | null>(null);
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState("");
  // Which nudge button is expanded ("weekly" = unplanned weekly, "carryover")
  const [openNudge, setOpenNudge] = useState<"weekly" | "carryover" | null>(null);

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

  // Count-mode weekly tasks still needing days planned this week — surfaced as a
  // nudge here too (BUILD_PLAN Phase 2), disappearing once fully planned.
  const countNudges = historical
    ? []
    : (weeklyBits?.weeklyTasks ?? []).filter(
        (t) => t.recurrence_mode === "count" && progress(t, cubeStates(t, checkinsFor(t.id), today)).toPlan > 0,
      );

  // Pull-forward suggestions: unscheduled tasks filling sparse, unblocked
  // sections. Recomputes when tasks or blocked windows change; the result is a
  // pure function so no memo needed for correctness.
  const pulled = pullForward(openTasks, today, setup?.blocked_windows ?? []);
  const byId = new Map(openTasks.map((t) => [t.id, t]));
  const pulledFor = (section: TimeSection): Task[] =>
    pulled[section].map((id) => byId.get(id)).filter((t): t is Task => !!t);

  // Split due-today into the Night-bookended ribbon (see SCHEDULE_SLOTS). Feeding
  // it `today` (which flips at 1:30 AM) is what advances the whole view daily.
  const partition = partitionSchedule(dueToday, today);

  const dayNavBar = dayNav && (
    <div className="flex items-center justify-between gap-2 mb-2">
      <button
        onClick={dayNav.onBack}
        disabled={!dayNav.canBack}
        aria-label="Step back a day"
        className="w-8 h-8 grid place-items-center rounded border border-signal-dim/30 text-dim enabled:hover:text-signal enabled:hover:border-signal/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <span className={`font-data text-[11px] tracking-wide ${historical ? "text-amber" : "text-dim"}`}>{dayNav.label}</span>
      <button
        onClick={dayNav.onForward}
        disabled={!dayNav.canForward}
        aria-label="Step forward a day"
        className="w-8 h-8 grid place-items-center rounded border border-signal-dim/30 text-dim enabled:hover:text-signal enabled:hover:border-signal/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  );

  // Read-back view of a past day: plain per-section grouping, no pull-forward /
  // weekly / drag (those are "today" concepts).
  const historicalBody = (
    <div className="space-y-2">
      {dueToday.length === 0 ? (
        <p className="text-dim text-sm py-1.5">Nothing scheduled for this day.</p>
      ) : (
        SECTION_ORDER.map((section) => {
          const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
          if (items.length === 0) return null;
          const clock = sectionClockLabel(section, setup?.wake_time);
          return (
            <div key={section} className="border border-signal-dim/15 rounded p-2">
              <p className="font-data text-[11px] uppercase tracking-widest mb-0.5 flex items-baseline gap-2">
                <span className="text-dim">{SECTION_LABELS[section]}</span>
                {clock && <span className="text-dim/45 tracking-normal normal-case text-[10px]">{clock}</span>}
              </p>
              <div className="divide-y divide-signal-dim/15">
                {items.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} category={cardProps.categoryOf?.(t)} descriptionMode="chevron" />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const body = (
    <>
      {dayNavBar}

      {!historical && setup && (
        <p className="flex flex-wrap gap-1.5 mb-2">
          <span className="hud-chip hud-chip-signal">wake {setup.wake_time.slice(0, 5)}</span>
          {setup.blocked_windows.map((w, i) => (
            <span key={i} className="hud-chip hud-chip-amber">
              ⛔ {w.start}–{w.end} {w.label}
            </span>
          ))}
        </p>
      )}

      {/* Two DISTINCT nudge buttons — weekly-task planning vs one-off carryover,
          never conflated (BUILD_PLAN). Each expands its own list. */}
      {!historical && (countNudges.length > 0 || carryover.length > 0) && (
        <div className="mb-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {countNudges.length > 0 && (
              <NudgeButton
                label="Unplanned Weekly Tasks"
                count={countNudges.length}
                open={openNudge === "weekly"}
                onClick={() => setOpenNudge((n) => (n === "weekly" ? null : "weekly"))}
              />
            )}
            {carryover.length > 0 && (
              <NudgeButton
                label="Carryover Tasks"
                count={carryover.length}
                open={openNudge === "carryover"}
                onClick={() => setOpenNudge((n) => (n === "carryover" ? null : "carryover"))}
              />
            )}
          </div>
          {openNudge === "weekly" && (
            <ul className="border border-amber/25 rounded p-2 space-y-1">
              {countNudges.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[13px] text-hud">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{t.name} — needs a day this week</span>
                </li>
              ))}
            </ul>
          )}
          {openNudge === "carryover" && (
            <ul className="border border-amber/25 rounded p-2 divide-y divide-signal-dim/15">
              {carryover.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => cardProps.onEdit(t)}
                    className="w-full text-left flex items-center gap-2 py-1 text-[13px] text-hud cursor-pointer hover:text-signal focus-visible:outline-2 focus-visible:outline-signal rounded"
                    aria-label={`Reschedule ${t.title}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    {t.due_date && <span className="hud-chip hud-chip-amber shrink-0">{formatDue(t.due_date, today)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {historical && historicalBody}

      {!historical && dueToday.length === 0 && weeklyToday.length === 0 && (
        <p className="text-dim text-sm py-1.5 mb-1">Clear for today — drag something in.</p>
      )}

      {!historical && (
      <div className="space-y-2">
        {SCHEDULE_SLOTS.map((slot) => {
          const items = (partition[slot.key] ?? []).sort(scheduleSort);
          // The leading "earlier" Night is passed context: no weekly check-ins
          // or pull-forward suggestions belong there, and it isn't a drop target.
          const isEarlier = slot.role === "earlier-night";
          const sectionWeekly = isEarlier
            ? []
            : weeklyToday.filter((t) => (t.time_section ?? "anytime") === slot.section);
          const suggestions = isEarlier ? [] : pulledFor(slot.section);
          const empty = items.length === 0 && sectionWeekly.length === 0 && suggestions.length === 0;
          // Keep the fixed six-part ribbon clean — only surface Anytime when it
          // actually holds something.
          if (slot.role === "anytime" && empty) return null;

          const clock = sectionClockLabel(slot.section, setup?.wake_time);
          const content = (
            <>
              <p className="font-data text-[11px] uppercase tracking-widest mb-0.5 flex items-baseline gap-2">
                <span className="text-dim">{slot.label}</span>
                {clock && <span className="text-dim/45 tracking-normal normal-case text-[10px]">{clock}</span>}
              </p>
              {empty ? (
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
                      <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} descriptionMode="chevron" />
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
                        <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} descriptionMode="chevron" />
                      </div>
                    </DraggableTask>
                  ))}
                </div>
              )}
            </>
          );

          // Droppable slots register a DnD zone; the passed "earlier" Night is a
          // read-only context row (dashed, dimmed), never a drop target.
          return slot.droppable ? (
            <DropZone key={slot.key} id={`section:${slot.section}`} className="border border-signal-dim/15 rounded p-2">
              {content}
            </DropZone>
          ) : (
            <div key={slot.key} className="border border-dashed border-signal-dim/15 rounded p-2 opacity-80">
              {content}
            </div>
          );
        })}
      </div>
      )}
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
