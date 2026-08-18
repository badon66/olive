import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { BlockedWindow } from "../../lib/api";
import { addDays, formatDue } from "../../lib/dates";
import { isLateBedtime } from "../../lib/dayrules";
import {
  nextSectionFor,
  orderBySortOrder,
  partitionSchedule,
  SCHEDULE_SLOTS,
  SECTION_ORDER,
  scheduleSort,
  sectionClockLabel,
  type TimeSection,
} from "../../lib/sections";
import { pullForward } from "../../lib/suggest";
import { appearsOn, cubeStates, progress } from "../../lib/weekly";
import { TaskCard } from "../TaskCard";
import { combineRows, ScheduleRow, splitOrderWrites, type ScheduleItem } from "./ScheduleRow";
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
  // The date actually being shown (drives the bedtime-rule lookup)
  date: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  // Centre button: jump straight back to today from any position
  onToday: () => void;
  isToday: boolean;
  historical: boolean;
  // The dashboard renders <DayNavigator> in the panel header instead
  inHeader?: boolean;
};

// [←] [today] [→] as one bordered block, sized to read as part of the header.
export function DayNavigator({ nav }: { nav: DayNav }) {
  const step =
    "w-9 h-10 grid place-items-center text-dim enabled:hover:text-signal enabled:hover:bg-signal/10 enabled:cursor-pointer disabled:opacity-25 disabled:cursor-default transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal";
  return (
    <span className="inline-flex items-stretch rounded-md border border-signal-dim/40 overflow-hidden divide-x divide-signal-dim/30">
      <button onClick={nav.onBack} disabled={!nav.canBack} aria-label="Previous day" className={step}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button
        onClick={nav.onToday}
        disabled={nav.isToday}
        aria-label="Jump to today"
        title={nav.isToday ? "Showing today" : `${nav.label} — back to today`}
        className={`px-3.5 h-10 font-data text-[11px] tracking-wide transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
          nav.isToday
            ? "text-dim cursor-default"
            : "text-amber hover:bg-amber/10 cursor-pointer"
        }`}
      >
        {nav.isToday ? "Today" : nav.label}
      </button>
      <button onClick={nav.onForward} disabled={!nav.canForward} aria-label="Next day" className={step}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </span>
  );
}

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
  onTripleClick?: (task: Task) => void;
  categoryOf?: (task: Task) => { name: string; color: string } | undefined;
};

type WeeklyBits = {
  weeklyTasks: WeeklyTask[];
  checkins: WeeklyCheckin[];
  completeDay: (id: string, date: string) => Promise<WeeklyCheckin | null>;
  uncompleteDay: (task: WeeklyTask, date: string) => Promise<void>;
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
  onMoveSection,
  nowSection,
  activeDay,
  onSaveOrder,
  onSaveWeeklyOrder,
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
  // Re-home a task displaced by the late-bedtime rule
  onMoveSection?: (taskId: string, section: TimeSection) => Promise<void>;
  // Which section the clock is in right now — highlights that slot
  nowSection?: TimeSection;
  // The day whose Night is still running (flips 5 AM, unlike the page's 1:30).
  // The highlight only shows on the page matching it.
  activeDay?: string;
  // Manual within-section ordering, persisted per task (works on any day)
  onSaveOrder?: (updates: { id: string; sort_order: number }[]) => void;
  onSaveWeeklyOrder?: (updates: { id: string; sort_order: number }[]) => void;
}) {
  const today = cardProps.today;
  const historical = dayNav?.historical ?? false;
  // The date this panel is actually rendering (the stepper's day when present).
  const shownDate = dayNav?.date ?? today;
  const [setup, setSetup] = useState<{ wake_time: string; blocked_windows: BlockedWindow[] } | null>(null);
  // Bedtime recorded for the night BEFORE the displayed day — a late one clears
  // that day's Morning slot (BUILD_PLAN's bedtime rule of thumb).
  const [prevBedtime, setPrevBedtime] = useState<string | null>(null);
  // Which nudge button is expanded ("weekly" = unplanned weekly, "carryover")
  const [openNudge, setOpenNudge] = useState<"weekly" | "carryover" | null>(null);

  const viewDate = dayNav?.date ?? today;

  useEffect(() => {
    let alive = true;
    const prevDay = addDays(viewDate, -1);
    void supabase
      .from("daily_schedule_setup")
      .select("date, wake_time, bedtime, blocked_windows")
      .in("date", [prevDay, viewDate])
      .then(({ data }) => {
        if (!alive) return;
        const rows = data ?? [];
        const own = rows.find((r) => r.date === viewDate);
        const prev = rows.find((r) => r.date === prevDay);
        setSetup(
          own ? { wake_time: own.wake_time, blocked_windows: (own.blocked_windows ?? []) as BlockedWindow[] } : null,
        );
        setPrevBedtime(prev?.bedtime ?? null);
      });
    return () => {
      alive = false;
    };
  }, [viewDate]);

  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  // Weekly tasks belong to whatever day is being VIEWED, not hardcoded to today
  // (BUILD_PLAN): a fixed-days task shows on every scheduled weekday, a
  // count-mode task on any day its weekly target isn't met yet. `appearsOn` was
  // always date-generic — it was simply being called with `today` every time,
  // which is why future days showed nothing.
  const weeklyToday = (weeklyBits?.weeklyTasks ?? []).filter((t) => appearsOn(t, checkinsFor(t.id), viewDate));

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
  // it `today` (which flips at 5 AM) is what advances the whole view daily.
  const partition = partitionSchedule(dueToday);

  // Bedtime rule: a late bedtime the night before clears this day's Morning slot
  // and asks where those tasks should go instead. Nothing is written until the
  // user picks — the override is day-scoped, never a standing change to the task.
  const morningCleared = !historical && isLateBedtime(prevBedtime);
  const displacedMorning = morningCleared ? (partition.morning ?? []).slice().sort(scheduleSort) : [];

  // Within-section ordering. Untouched sections keep the normal schedule sort;
  // once the user nudges something with the arrows, their placement wins.
  // sort_order lives on the task, so this works on any day, not just today.
  const orderedFor = (key: string) => orderBySortOrder(partition[key] ?? []);
  const canReorder = !!onSaveOrder;

  // One combined, ordered list per section: regular tasks AND weekly
  // occurrences, interleaved by sort_order. This is what the arrows act on.
  const rowsFor = (slotKey: string, weekly: WeeklyTask[]) =>
    combineRows<Task, WeeklyTask>(
      orderedFor(slotKey).map((t) => ({
        kind: "task" as const,
        id: t.id,
        label: t.title,
        sort: t.sort_order,
        task: t,
      })),
      weekly.map((w) => ({ kind: "weekly" as const, id: w.id, label: w.name, sort: w.sort_order, weekly: w })),
    );

  const moveRow = (
    slotKey: string,
    rows: ScheduleItem<Task, WeeklyTask>[],
    index: number,
    dir: -1 | 1,
  ) => {
    const j = index + dir;
    if (j >= 0 && j < rows.length) {
      const next = [...rows];
      [next[index], next[j]] = [next[j], next[index]];
      const { tasks, weekly } = splitOrderWrites(next);
      onSaveOrder?.(tasks);
      if (weekly.length > 0) onSaveWeeklyOrder?.(weekly);
      return;
    }
    // At the edge — carry a regular task across the section boundary. Weekly
    // occurrences stay put: their section is a property of the weekly task
    // itself, moved via its own edit modal or a drag, not a nudge.
    const row = rows[index];
    if (!row || row.kind !== "task") return;
    moveTask(slotKey, row.task, dir);
  };

  // Pushed off the end of a section: carry the task across the boundary into the
  // neighbouring one instead of doing nothing (BUILD_PLAN). Completely empty
  // sections in between are skipped in a single press.
  const moveTask = (_slotKey: string, task: Task, dir: -1 | 1) => {
    if (!onMoveSection) return;
    const occupied = new Set<TimeSection>(SECTION_ORDER.filter((s) => (partition[s] ?? []).length > 0));
    const dest = nextSectionFor((task.time_section ?? "anytime") as TimeSection, dir, occupied);
    if (dest) void onMoveSection(task.id, dest.section);
  };

  // The navigator now lives in the panel header (see DayNavigator); the panel
  // body only renders it when used standalone (mobile brief, no DashSection).
  const dayNavBar = dayNav && !dayNav.inHeader && (
    <div className="flex items-center justify-between gap-2 mb-2">
      <button
        onClick={dayNav.onBack}
        disabled={!dayNav.canBack}
        aria-label="Step back a day"
        className="w-8 h-8 grid place-items-center rounded border border-signal-dim/30 text-dim enabled:hover:text-signal enabled:hover:border-signal/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      {/* Centre button jumps straight back to today from wherever you are */}
      <button
        onClick={dayNav.onToday}
        disabled={dayNav.isToday}
        aria-label="Jump to today"
        className={`px-3 h-8 rounded border font-data text-[11px] tracking-wide transition duration-200 ${
          dayNav.isToday
            ? "border-signal-dim/25 text-dim cursor-default"
            : "border-amber/50 text-amber hover:bg-amber/10 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
        }`}
      >
        {dayNav.isToday ? "Today" : `${dayNav.label} · back to today`}
      </button>
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

      {/* Bedtime rule: Morning was cleared for this day. Ask where each task
          should go — one tap writes the new section, nothing moves on its own. */}
      {morningCleared && (
        <div className="mb-2 border border-amber/30 rounded p-2 space-y-1.5">
          <p className="font-data text-[11px] text-amber uppercase tracking-wider">
            Morning cleared — bedtime was {prevBedtime?.slice(0, 5)}
          </p>
          {displacedMorning.length === 0 ? (
            <p className="text-dim text-xs">Nothing was scheduled for this morning.</p>
          ) : (
            <ul className="space-y-1.5">
              {displacedMorning.map((t) => (
                <li key={t.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0 truncate font-body text-[13px]">{t.title}</span>
                  <span className="flex gap-1 shrink-0">
                    {(["midday", "afternoon", "evening", "night", "anytime"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => void onMoveSection?.(t.id, s)}
                        disabled={!onMoveSection}
                        className="font-data text-[10px] px-1.5 py-0.5 rounded border border-signal-dim/40 text-dim hover:border-signal hover:text-signal disabled:opacity-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
                        aria-label={`Move ${t.title} to ${s}`}
                      >
                        {SECTION_LABELS[s]}
                      </button>
                    ))}
                  </span>
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
          // Morning is emptied when the bedtime rule fires — its tasks move to the
          // prompt above rather than being listed here.
          const slotCleared = morningCleared && slot.key === "morning";
          const items = slotCleared ? [] : orderedFor(slot.key);
          const sectionWeekly = weeklyToday.filter((t) => (t.time_section ?? "anytime") === slot.section);
          const suggestions = pulledFor(slot.section);
          const empty = items.length === 0 && sectionWeekly.length === 0 && suggestions.length === 0;
          // Keep the ribbon clean — only surface Anytime when it holds something.
          if (slot.role === "anytime" && empty) return null;
          // Highlight whichever section the clock is actually in right now, and
          // only on the day that section belongs to. Between 1:30 and 5:00 AM
          // that is the PREVIOUS day's page (its Night is still running), so this
          // deliberately keys off `activeDay` rather than "is this today's view" —
          // arrowing back one day in that window is what surfaces the highlight.
          const isNow = activeDay !== undefined && shownDate === activeDay && nowSection === slot.section;

          const clock = sectionClockLabel(slot.section, setup?.wake_time);
          const content = (
            <>
              <p className="font-data text-[11px] uppercase tracking-widest mb-0.5 flex items-baseline gap-2">
                <span className="text-dim">{slot.label}</span>
                {clock && <span className="text-dim/45 tracking-normal normal-case text-[10px]">{clock}</span>}
              </p>
              {slotCleared ? (
                <p className="text-amber/80 text-xs py-1">Cleared — late night. See above.</p>
              ) : empty ? (
                <p className="text-dim/50 text-xs py-1">—</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {/* Regular tasks and weekly occurrences share ONE list and ONE
                      row wrapper, so arrows apply to everything this panel shows
                      without branching on item type (BUILD_PLAN). */}
                  {rowsFor(slot.key, sectionWeekly).map((row, i, all) => {
                    const inner =
                      row.kind === "task" ? (
                        <DraggableTask zone="sched" task={row.task}>
                          <TaskCard
                            task={row.task}
                            {...cardProps}
                            category={cardProps.categoryOf?.(row.task)}
                            descriptionMode="chevron"
                          />
                        </DraggableTask>
                      ) : (
                        (() => {
                          const w = row.weekly;
                          // Check-off state belongs to the day being viewed, not today
                          const checked = checkinsFor(w.id).some(
                            (c) => c.date === viewDate && c.status === "completed",
                          );
                          return (
                            <DraggableWeekly zone="schedweekly" weekly={w}>
                              <div className="flex items-center gap-3 py-1.5">
                                <button
                                  // Instant, no follow-up prompt: check off and done.
                                  onClick={async () => {
                                    if (checked) await weeklyBits!.uncompleteDay(w, viewDate);
                                    else await weeklyBits!.completeDay(w.id, viewDate);
                                  }}
                                  aria-label={checked ? `Uncheck ${w.name}` : `Check off ${w.name}`}
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
                                  {w.name}
                                </span>
                                <span className="hud-chip shrink-0">weekly</span>
                              </div>
                            </DraggableWeekly>
                          );
                        })()
                      );
                    return (
                      <ScheduleRow
                        key={`${row.kind}-${row.id}`}
                        index={i}
                        count={all.length}
                        label={row.label}
                        onMove={(idx, dir) => moveRow(slot.key, all, idx, dir)}
                        showArrows={canReorder}
                      >
                        {inner}
                      </ScheduleRow>
                    );
                  })}
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
          // Every slot is droppable now; the section the clock is in gets a
          // brighter border so "where am I right now" is obvious at a glance.
          return (
            <DropZone
              key={slot.key}
              id={`section:${slot.section}`}
              className={`border rounded p-2 transition-colors duration-200 ${
                isNow
                  ? "border-signal/60 bg-signal/[0.05] shadow-[0_0_12px_rgba(63,169,104,0.18)]"
                  : "border-signal-dim/15"
              }`}
            >
              {content}
            </DropZone>
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
