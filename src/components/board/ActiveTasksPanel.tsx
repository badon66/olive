import { useState } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { formatClock } from "../../lib/dates";
import { orderBySortOrder, scheduleSort, splitAnytime, type TimeSection } from "../../lib/sections";
import { appearsOn, type DayOverrideLike, type OverrideField, resolveWeeklyDay } from "../../lib/weekly";
import { SkeletonRows } from "../Skeleton";
import { TaskCard } from "../TaskCard";
import { combineRows, liftRows, ScheduleRow, splitOrderWrites, type ScheduleItem } from "./ScheduleRow";
import { DraggableTask, DropZone } from "./TaskDnd";

// Priority runs 1–5. An anytime task at the top priority never folds into
// the Anytime dropdown — it always shows in the main list.
const TOP_PRIORITY = 5;

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
  onDoubleClick?: (task: Task) => void;
  categoryOf?: (task: Task) => { name: string; color: string } | undefined;
  // Per-day completion for pick-days tasks (see lib/flexible.ts).
  onCompleteDay?: (id: string, date: string) => void;
  onUncompleteDay?: (id: string, date: string) => void;
};

type WeeklyBits = {
  weeklyTasks: WeeklyTask[];
  checkins: WeeklyCheckin[];
  // One-day-only occurrence tweaks (name / part of day / clock time).
  dayOverrides?: DayOverrideLike[];
  completeDay?: (id: string, date: string) => Promise<WeeklyCheckin | null>;
  uncompleteDay?: (task: WeeklyTask, date: string) => Promise<void>;
};

// A weekly occurrence resolved for the day on screen — name/section may come
// from a one-day override, plus any clock time pinned for that day.
type ResolvedWeekly = WeeklyTask & { scheduled_time: string | null; overridden: OverrideField[] };

// Live snapshot of ONLY the current part of the day (midday tasks at midday,
// afternoon tasks in the afternoon) — distinct from the fuller Today's Schedule.
// Glanceable: descriptions always visible, generous spacing, complete inline.
export function ActiveTasksPanel({
  section,
  dueToday,
  cardProps,
  weeklyBits,
  onSaveOrder,
  onSaveWeeklyOrder,
  onWeeklyDoubleClick,
  loading = false,
}: {
  section: TimeSection;
  dueToday: Task[];
  cardProps: CardProps;
  weeklyBits?: WeeklyBits;
  onSaveOrder?: (updates: { id: string; sort_order: number }[]) => void;
  onSaveWeeklyOrder?: (updates: { id: string; sort_order: number }[]) => void;
  // Double-click a weekly occurrence -> "Skip today" (BUILD_PLAN). Weekly rows
  // have no competing single-click action, so this is a plain dblclick with no
  // delay — unlike TaskCard, where it must not race the edit modal.
  onWeeklyDoubleClick?: (weekly: WeeklyTask, date: string) => void;
  // While the stores load, show skeletons instead of asserting "nothing scheduled"
  loading?: boolean;
}) {
  const today = cardProps.today;
  const [anytimeOpen, setAnytimeOpen] = useState(false);

  // Anytime is CONDITIONAL (BUILD_PLAN), so the two groups are kept apart right
  // from the source data rather than merged and re-separated later.
  const sectionOf = (ts: string | null) => ts ?? "anytime";
  const sectionTasks = dueToday.filter((t) => sectionOf(t.time_section) === section).sort(scheduleSort);
  const anytimeTasks = dueToday.filter((t) => sectionOf(t.time_section) === "anytime").sort(scheduleSort);

  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  const weeklyIn = (want: string) =>
    (weeklyBits?.weeklyTasks ?? [])
      .filter((t) => appearsOn(t, checkinsFor(t.id), today))
      // Resolved BEFORE the section filter: a day override can move an
      // occurrence into a different part of the day, which decides whether it
      // belongs in this panel at all.
      .map((t) => resolveWeeklyDay(t, weeklyBits?.dayOverrides ?? [], today))
      .filter((t) => sectionOf(t.time_section) === want);
  const sectionWeekly = weeklyIn(section);
  const anytimeWeekly = section === "anytime" ? [] : weeklyIn("anytime");

  // ONE combined list per group — regular tasks and weekly occurrences together
  // — so the arrows move an item relative to what is actually on screen, not
  // just its own kind. Overdue lifted AFTER combining, because combineRows
  // re-sorts placed rows by sort_order and would discard a pre-combine lift.
  const isOverdueRow = (r: ScheduleItem<Task, ResolvedWeekly>) =>
    r.kind === "task" && r.task.due_date !== null && r.task.due_date < today;
  const build = (tasks: Task[], weekly: ResolvedWeekly[]) =>
    liftRows(
      combineRows<Task, ResolvedWeekly>(
        orderBySortOrder(tasks).map((t) => ({
          kind: "task" as const,
          id: t.id,
          label: t.title,
          sort: t.sort_order,
          time: t.scheduled_time,
          task: t,
        })),
        weekly.map((w) => ({
          kind: "weekly" as const,
          id: w.id,
          label: w.name,
          sort: w.sort_order,
          time: w.scheduled_time,
          weekly: w,
        })),
      ),
      isOverdueRow,
    );

  // If the current part of day has nothing of its own, anytime work is promoted
  // into the main list so the panel is never needlessly empty. If it does have
  // its own work, anytime folds into the dropdown instead of competing with it —
  // EXCEPT top-priority (5) anytime tasks, which always show in the main list.
  const split = splitAnytime(
    build(sectionTasks, sectionWeekly),
    build(anytimeTasks, anytimeWeekly),
    (r) => r.kind === "task" && r.task.priority_weight >= TOP_PRIORITY,
  );
  // Overdue still sorts to the top across the combined list (BUILD_PLAN).
  const primary = liftRows(split.primary, isOverdueRow);
  const dropdown = split.dropdown;
  const promoted = sectionTasks.length + sectionWeekly.length === 0 && primary.length > 0;
  const total = primary.length + dropdown.length;

  const showArrows = !!onSaveOrder;
  // Arrows reorder the PRIMARY list only. Active Tasks shows one section, so
  // there is no adjacent section on screen to cross into; they stop at the ends
  // rather than silently moving a task somewhere the panel can't show.
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= primary.length) return;
    const next = [...primary];
    [next[index], next[j]] = [next[j], next[index]];
    const { tasks, weekly } = splitOrderWrites(next);
    onSaveOrder?.(tasks);
    if (weekly.length > 0) onSaveWeeklyOrder?.(weekly);
  };

  // Both kinds go through one renderer, so the row body is written once and
  // serves the main list and the dropdown identically.
  const renderRow = (row: ScheduleItem<Task, ResolvedWeekly>) =>
    row.kind === "task" ? (
      <DraggableTask zone="active" task={row.task} className="py-1">
        <TaskCard
          task={row.task}
          {...cardProps}
          occurrenceDate={today}
          category={cardProps.categoryOf?.(row.task)}
          descriptionMode="always"
        />
      </DraggableTask>
    ) : (
      (() => {
        const w = row.weekly;
        const done = checkinsFor(w.id).some((c) => c.date === today && c.status === "completed");
        return (
          <div className="flex items-center gap-3 py-3" onDoubleClick={() => onWeeklyDoubleClick?.(w, today)}>
            <button
              onClick={() =>
                done ? void weeklyBits?.uncompleteDay?.(w, today) : void weeklyBits?.completeDay?.(w.id, today)
              }
              aria-label={done ? `Uncheck ${w.name}` : `Check off ${w.name}`}
              className="shrink-0 w-11 h-11 grid place-items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded-full"
            >
              <span
                className={`w-5 h-5 rounded-full border grid place-items-center transition-colors duration-200 ${
                  done ? "border-signal bg-signal/20" : "border-signal-dim hover:border-signal hover:shadow-[0_0_8px_rgba(63,169,104,0.4)]"
                }`}
              >
                {done && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-signal" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
            </button>
            <span className={`flex-1 min-w-0 truncate font-body text-base ${done ? "opacity-50 line-through" : ""}`}>
              {w.name}
            </span>
            {/* Same treatment as Today's Schedule: a one-day override shows its
                pinned time and says plainly that it is scoped to this day. */}
            {w.scheduled_time && (
              <span className="hud-chip hud-chip-signal shrink-0">{formatClock(w.scheduled_time)}</span>
            )}
            {w.overridden.length > 0 && (
              <span
                className="hud-chip hud-chip-amber shrink-0"
                title="Changed for this day only. The weekly pattern is unchanged."
              >
                just this day
              </span>
            )}
            <span className="hud-chip shrink-0">weekly</span>
          </div>
        );
      })()
    );

  return (
    <DropZone id={`section:${section}:${today}`} className="h-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="hud-chip hud-chip-signal">{SECTION_LABELS[section]} — right now</span>
        <span className="hud-chip">{total}</span>
      </div>

      {loading ? (
        <SkeletonRows count={3} />
      ) : total === 0 ? (
        <p className="text-dim text-sm py-1.5">Nothing scheduled for this part of the day.</p>
      ) : (
        <>
          {/* Says WHY anytime work is in the main list, so a glance doesn't read
              it as belonging to this part of the day. */}
          {promoted && (
            <p className="font-data text-[10px] text-dim/70 mb-1">
              Nothing set for {SECTION_LABELS[section].toLowerCase()} — showing anytime work
            </p>
          )}
          <div className="divide-y divide-signal-dim/15">
            {primary.map((row, i) => (
              <ScheduleRow
                key={`${row.kind}-${row.id}`}
                index={i}
                count={primary.length}
                label={row.label}
                onMove={move}
                // Single-row: nothing to reorder, and unlike Today's Schedule
                // these arrows never cross sections — so hide the dead pair
                // instead of showing two disabled chevrons.
                showArrows={showArrows && primary.length > 1}
              >
                {renderRow(row)}
              </ScheduleRow>
            ))}
          </div>

          {dropdown.length > 0 && (
            <div className="mt-2 border-t border-signal-dim/20 pt-1.5">
              <button
                onClick={() => setAnytimeOpen((o) => !o)}
                aria-expanded={anytimeOpen}
                className="w-full flex items-center gap-1.5 py-1.5 font-data text-[11px] text-dim hover:text-signal cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal transition-colors duration-150"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`w-3 h-3 transition-transform duration-200 ${anytimeOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Anytime
                <span className="px-1.5 rounded bg-signal/15 text-signal">{dropdown.length}</span>
              </button>
              {anytimeOpen && (
                <div className="divide-y divide-signal-dim/15">
                  {/* Parked, not competing: no arrows here — reordering belongs
                      to the work actually scheduled for now. */}
                  {dropdown.map((row) => (
                    <div key={`${row.kind}-${row.id}`}>{renderRow(row)}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </DropZone>
  );
}
