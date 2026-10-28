import { useMemo, useState } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyTask } from "../../hooks/useWeeklyTasks";
import { useDaySetup } from "../../hooks/useDaySetup";
import type { ActiveRow } from "../../lib/activeRows";
import { arrowMove, buildDaySchedule, canCross, dueOnDay } from "../../lib/daySchedule";
import { dayIsDone, showsOnDate } from "../../lib/flexible";
import { formatClock } from "../../lib/dates";
import {
  SCHEDULE_SLOTS,
  SECTION_ORDER,
  sectionClockLabel,
  sectionOptionLabel,
  sectionProgress,
  type TimeSection,
} from "../../lib/sections";
import { SkeletonRows } from "../Skeleton";
import { SECTION_NAMES } from "./NowTab";
import { usePhone } from "./PhoneContext";
import { PhoneRow } from "./PhoneRow";
import { IconCheck, IconChevron } from "./icons";

type Row = ActiveRow<Task, WeeklyTask>;

// TODAY — the day's sections stacked top to bottom (BUILD_PLAN "Today tab").
// Every rule — what belongs to the viewed day, weekly occurrences resolved for
// it, overdue first, pull-forward suggestions, the bedtime rule, the arrows —
// comes from lib/daySchedule, the same functions desktop's Today's Schedule
// uses. Only the presentation differs: on the live day, finished sections fold
// to one line, the current one is highlighted with its progress line, upcoming
// ones are open, and an empty one is a single thin line.
export function TodayTab() {
  const ctx = usePhone();
  const { taskStore, weeklyStore, open, today, activeDay, nowSection, nowMinutes, viewDate } = ctx;
  const { setup, prevBedtime } = useDaySetup(viewDate);

  const isToday = viewDate === today;
  // Genuinely over — the same "historical" rule as desktop (before the active day).
  const historical = viewDate < activeDay;
  // The day whose sections are live right now (the 5 AM boundary): between
  // 1:30 and 5:00 AM that is yesterday's page, not today's.
  const isLiveDay = viewDate === activeDay;

  const dueList = useMemo(() => dueOnDay(open, viewDate, isToday), [open, viewDate, isToday]);
  const day = buildDaySchedule<Task, WeeklyTask>({
    viewDate,
    today,
    dueList,
    openTasks: isToday ? open : [],
    // Desktop shows no weekly occurrences on a day that is over; same here.
    weeklyTasks: historical ? [] : weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    dayOverrides: weeklyStore.dayOverrides,
    historical,
    blockedWindows: setup?.blocked_windows ?? [],
    prevBedtime,
  });

  // Finished work recorded on the viewed day, for the "2/2 ✓" counts on
  // folded sections (open lists only hold what is still to do).
  const completedOnDay = useMemo(
    () => taskStore.tasks.filter((t) => t.status === "completed" && showsOnDate(t, viewDate)),
    [taskStore.tasks, viewDate],
  );

  const nowIndex = SECTION_ORDER.indexOf(nowSection);
  const loading = taskStore.loading || weeklyStore.loading;

  const isDoneRow = (r: Row) =>
    r.kind === "task"
      ? dayIsDone(r.task, viewDate)
      : weeklyStore.checkins.some((c) => c.weekly_task_id === r.weekly.id && c.date === viewDate && c.status === "completed");

  const onArrow = (rows: Row[], index: number, dir: -1 | 1) => {
    const m = arrowMove(rows, index, dir, day.occupiedSections);
    if (!m) return;
    if (m.kind === "order") {
      void taskStore.saveOrder(m.tasks);
      if (m.weekly.length > 0) void weeklyStore.saveWeeklyOrder(m.weekly);
    } else {
      void taskStore.updateTask(m.taskId, { time_section: m.section });
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-28">
      {setup && !historical && (
        <p className="flex flex-wrap gap-1.5 px-4 pt-3">
          <span className="hud-chip hud-chip-signal">wake {formatClock(setup.wake_time)}</span>
          {setup.blocked_windows.map((w, i) => (
            <span key={i} className="hud-chip hud-chip-amber">
              ⛔ {formatClock(w.start)}–{formatClock(w.end)} {w.label}
            </span>
          ))}
        </p>
      )}

      {/* Bedtime rule: a late night clears this day's Morning; one tap rehomes
          each item (a task's section, or a weekly occurrence for this day only). */}
      {day.morningCleared && (day.displacedMorning.length > 0 || day.displacedWeekly.length > 0) && (
        <div className="mx-3 mt-3 rounded-lg border border-amber/40 p-3 space-y-2">
          <p className="font-data text-[12px] text-amber">
            Morning cleared — bedtime was {prevBedtime ? formatClock(prevBedtime) : "late"}. Move these:
          </p>
          {day.displacedMorning.map((t) => (
            <div key={t.id} className="space-y-1">
              <p className="font-body text-[15px] text-hud">{t.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {(["midday", "afternoon", "evening", "night", "anytime"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => void taskStore.updateTask(t.id, { time_section: s })}
                    className="min-h-[44px] px-2.5 rounded-md border border-signal-dim/50 font-data text-[12px] text-dim"
                  >
                    {sectionOptionLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {day.displacedWeekly.map((w) => (
            <div key={`w-${w.id}`} className="space-y-1">
              <p className="font-body text-[15px] text-hud">
                {w.name} <span className="hud-chip">weekly</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["midday", "afternoon", "evening", "night", "anytime"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => void weeklyStore.pinWeeklySection(w.id, viewDate, s)}
                    className="min-h-[44px] px-2.5 rounded-md border border-signal-dim/50 font-data text-[12px] text-dim"
                  >
                    {sectionOptionLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="px-4 py-4">
          <SkeletonRows count={5} />
        </div>
      ) : (
        <div className="pt-2">
          {SCHEDULE_SLOTS.map((slot) => {
            const cleared = day.morningCleared && slot.key === "morning";
            const rows = cleared ? [] : day.rowsFor(slot.key, day.sectionWeekly(slot.section));
            const suggestions = day.pulledFor(slot.section);
            const completedHere = completedOnDay.filter((t) => (t.time_section ?? "anytime") === slot.section);
            const empty = rows.length === 0 && suggestions.length === 0;
            if (slot.role === "anytime" && empty) return null;

            const idx = SECTION_ORDER.indexOf(slot.section);
            const isNow = isLiveDay && slot.section === nowSection;
            // Finished = its time is over on the live day. Anytime has no clock.
            const finished = isLiveDay && slot.section !== "anytime" && idx < nowIndex;
            return (
              <TodaySection
                // Keyed by day too, so a fold made on one day does not carry to another.
                key={`${viewDate}-${slot.key}`}
                section={slot.section}
                clock={sectionClockLabel(slot.section, setup?.wake_time)}
                rows={rows}
                suggestions={suggestions}
                cleared={cleared}
                isNow={isNow}
                finished={finished}
                elapsed={isNow ? sectionProgress(slot.section, nowMinutes, setup?.wake_time) : 0}
                doneCount={rows.filter(isDoneRow).length + completedHere.length}
                totalCount={rows.length + completedHere.length}
                date={viewDate}
                canArrow={!historical}
                onArrow={onArrow}
                occupied={day.occupiedSections}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TodaySection({
  section,
  clock,
  rows,
  suggestions,
  cleared,
  isNow,
  finished,
  elapsed,
  doneCount,
  totalCount,
  date,
  canArrow,
  onArrow,
  occupied,
}: {
  section: TimeSection;
  clock: string | null;
  rows: Row[];
  suggestions: Task[];
  cleared: boolean;
  isNow: boolean;
  finished: boolean;
  elapsed: number;
  doneCount: number;
  totalCount: number;
  date: string;
  canArrow: boolean;
  onArrow: (rows: Row[], index: number, dir: -1 | 1) => void;
  occupied: ReadonlySet<TimeSection>;
}) {
  // Finished sections start folded to one line; tap to open any of them.
  const [open, setOpen] = useState(!finished);
  const empty = rows.length === 0 && suggestions.length === 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

  if (cleared) {
    return (
      <div className="flex items-baseline gap-2 px-4 min-h-[40px] py-2 border-b border-panel-border/60">
        <span className="font-display text-[12px] tracking-[0.14em] uppercase text-dim">{SECTION_NAMES[section]}</span>
        <span className="font-data text-[12px] text-amber/80">Cleared — late night</span>
      </div>
    );
  }

  // Empty sections: one thin line, still shown so the day reads as a whole.
  if (empty) {
    return (
      <div
        className={`flex items-baseline gap-2 px-4 min-h-[36px] py-2 border-b border-panel-border/60 ${
          isNow ? "border-l-2 border-l-signal bg-signal/[0.05]" : ""
        }`}
      >
        <span className={`font-display text-[11px] tracking-[0.14em] uppercase ${isNow ? "text-signal" : "text-dim/80"}`}>
          {SECTION_NAMES[section]}
        </span>
        {clock && <span className="font-data text-[11px] text-dim/60">{clock}</span>}
        <span className="flex-1" />
        <span className="font-data text-[11px] text-dim/60">
          {totalCount > 0 ? `${doneCount}/${totalCount} ✓` : "Nothing planned"}
        </span>
      </div>
    );
  }

  const header = (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="w-full flex items-center gap-2 px-4 min-h-[48px] text-left focus-visible:outline-2 focus-visible:outline-signal"
    >
      <span className={`font-display text-[13px] tracking-[0.14em] uppercase ${isNow ? "text-signal" : "text-hud/90"}`}>
        {SECTION_NAMES[section]}
      </span>
      {clock && <span className="font-data text-[12px] text-dim">{clock}</span>}
      <span className="flex-1" />
      {finished && !open ? (
        <span className={`inline-flex items-center gap-1 font-data text-[13px] ${allDone ? "text-signal" : "text-amber"}`}>
          {doneCount}/{totalCount}
          {allDone ? <IconCheck className="w-3.5 h-3.5" /> : <span className="text-[11px]">· {totalCount - doneCount} left</span>}
        </span>
      ) : (
        <span className="font-data text-[12px] text-dim">{doneCount}/{totalCount}</span>
      )}
      <span className={`text-dim transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
        <IconChevron className="w-4 h-4" />
      </span>
    </button>
  );

  return (
    <section
      className={`relative border-b border-panel-border/60 ${isNow ? "mx-2 my-1 rounded-lg border border-signal/50 bg-signal/[0.06] overflow-hidden" : ""}`}
      aria-label={`${SECTION_NAMES[section]}${isNow ? " — right now" : ""}`}
    >
      {isNow && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 h-[3px] w-full origin-left bg-signal transition-transform duration-700"
          style={{ transform: `scaleX(${elapsed})` }}
        />
      )}
      {header}
      {open && (
        <div className="divide-y divide-signal-dim/15 pb-1">
          {rows.map((r, i) => {
            const crosses = (dir: -1 | 1) => canArrow && canCross(r, section, dir, occupied);
            return (
              <PhoneRow
                key={`${r.kind}-${r.id}`}
                row={r}
                date={date}
                index={i}
                count={rows.length}
                onMove={canArrow ? (index, dir) => onArrow(rows, index, dir) : undefined}
                canUp={i === 0 ? crosses(-1) : undefined}
                canDown={i === rows.length - 1 ? crosses(1) : undefined}
              />
            );
          })}
          {suggestions.map((t) => (
            <PhoneRow
              key={`pf-${t.id}`}
              row={{ kind: "task", id: t.id, label: t.title, sort: t.sort_order, time: t.scheduled_time, task: t }}
              date={date}
              suggested
            />
          ))}
        </div>
      )}
    </section>
  );
}
