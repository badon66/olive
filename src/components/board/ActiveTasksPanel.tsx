import { useState } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { useChecklistStore } from "../../hooks/useChecklists";
import { progressLabel } from "../../lib/checklist";
import { formatClock } from "../../lib/dates";
import { dayIsDone } from "../../lib/flexible";
import { anytimeShowsInMain, orderBySortOrder, scheduleSort, splitAnytime, type TimeSection } from "../../lib/sections";
import { appearsOn, type DayOverrideLike, type OverrideField, resolveWeeklyDay } from "../../lib/weekly";
import { SkeletonRows } from "../Skeleton";
import { TaskCard } from "../TaskCard";
import { useDoubleClick } from "../TaskActionPopup";
import { combineRows, liftRows, ScheduleRow, splitOrderWrites, type ScheduleItem } from "./ScheduleRow";
import { DraggableTask, DropZone } from "./TaskDnd";

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

// One weekly occurrence row. Single click on the name opens the weekly task's
// popup (checklist first — the only place its items are ticked); double-click
// keeps the quick-actions popup. The same held-click pattern TaskCard uses, so
// the two gestures never race.
function WeeklyRow({
  w,
  date,
  done,
  onToggle,
  onEdit,
  onDoubleClick,
}: {
  w: ResolvedWeekly;
  date: string;
  done: boolean;
  onToggle: () => void;
  onEdit?: (w: WeeklyTask, date: string) => void;
  onDoubleClick?: (w: WeeklyTask, date: string) => void;
}) {
  const checklist = useChecklistStore();
  const count = progressLabel(checklist?.weeklyProgress(w.id, date));
  const onName = useDoubleClick(
    () => onEdit?.(w, date),
    () => onDoubleClick?.(w, date),
  );
  return (
    <div className="flex items-center gap-3 py-3">
      <button
        onClick={onToggle}
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
      <button
        onClick={onEdit || onDoubleClick ? onName : undefined}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left font-body text-base rounded ${
          onEdit ? "cursor-pointer hover:text-signal" : "cursor-default"
        } focus-visible:outline-2 focus-visible:outline-signal ${done ? "opacity-50" : ""}`}
        aria-label={onEdit ? `Edit ${w.name}` : w.name}
        title={onEdit ? "Click to open · double-click for quick actions" : undefined}
      >
        <span className={`truncate ${done ? "line-through" : ""}`}>{w.name}</span>
        {count && (
          <span className="hud-chip hud-chip-signal shrink-0" title="Checklist progress for this day" aria-label={`Checklist ${count} done`}>
            ☑ {count}
          </span>
        )}
      </button>
      {/* Same treatment as Today's Schedule: a one-day override shows its
          pinned time and says plainly that it is scoped to this day. */}
      {w.scheduled_time && <span className="hud-chip hud-chip-signal shrink-0">{formatClock(w.scheduled_time)}</span>}
      {w.overridden.length > 0 && (
        <span className="hud-chip hud-chip-amber shrink-0" title="Changed for this day only. The weekly pattern is unchanged.">
          just this day
        </span>
      )}
      <span className="hud-chip shrink-0">weekly</span>
    </div>
  );
}

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
  onEditWeekly,
  loading = false,
}: {
  section: TimeSection;
  dueToday: Task[];
  cardProps: CardProps;
  weeklyBits?: WeeklyBits;
  onSaveOrder?: (updates: { id: string; sort_order: number }[]) => void;
  onSaveWeeklyOrder?: (updates: { id: string; sort_order: number }[]) => void;
  // Double-click a weekly occurrence -> "Skip today" (BUILD_PLAN).
  onWeeklyDoubleClick?: (weekly: WeeklyTask, date: string) => void;
  // Single-click a weekly occurrence -> its popup (checklist first).
  onEditWeekly?: (weekly: WeeklyTask, date: string) => void;
  // While the stores load, show skeletons instead of asserting "nothing scheduled"
  loading?: boolean;
}) {
  const today = cardProps.today;
  const [anytimeOpen, setAnytimeOpen] = useState(false);
  // The urgent/medium anytime work surfaced into the main list can still be
  // folded away by hand (BUILD_PLAN: "the user can still collapse it manually").
  const [surfacedOpen, setSurfacedOpen] = useState(true);

  // Anytime is CONDITIONAL (BUILD_PLAN), so the two groups are kept apart right
  // from the source data rather than merged and re-separated later.
  const sectionOf = (ts: string | null) => ts ?? "anytime";
  const sectionTasks = dueToday.filter((t) => sectionOf(t.time_section) === section).sort(scheduleSort);
  const anytimeTasks = dueToday.filter((t) => sectionOf(t.time_section) === "anytime").sort(scheduleSort);

  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  const weeklyDone = (id: string) => checkinsFor(id).some((c) => c.date === today && c.status === "completed");
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

  // How busy is the current section, in UNCOMPLETED work of its own? Anytime
  // tasks are excluded by construction. Decides whether medium-priority anytime
  // work is surfaced (BUILD_PLAN: 2 or fewer → surfaced).
  const ownUncompleted =
    sectionTasks.filter((t) => !dayIsDone(t, today)).length + sectionWeekly.filter((w) => !weeklyDone(w.id)).length;

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

  // Base rule: an empty section promotes ALL anytime work into the main list;
  // a section with its own work folds anytime into the dropdown. Priority
  // overrides on top (anytimeShowsInMain): urgent always surfaces, medium
  // surfaces while the section is light, low never does.
  const surfaces = (r: ScheduleItem<Task, ResolvedWeekly>) =>
    r.kind === "task" && anytimeShowsInMain(r.task.priority_weight, ownUncompleted);
  const split = splitAnytime(build(sectionTasks, sectionWeekly), build(anytimeTasks, anytimeWeekly), surfaces);
  const promoted = sectionTasks.length + sectionWeekly.length === 0 && split.primary.length > 0;
  // Which main-list rows are anytime work surfaced by priority (not by an empty
  // section)? They get their own thin, collapsible group below the section's
  // own work, so they read as "surfaced", not as belonging to this part of day.
  const ownIds = new Set(build(sectionTasks, sectionWeekly).map((r) => `${r.kind}-${r.id}`));
  const surfacedRows = promoted ? [] : split.primary.filter((r) => !ownIds.has(`${r.kind}-${r.id}`));
  const surfacedIds = new Set(surfacedRows.map((r) => `${r.kind}-${r.id}`));
  // Overdue still sorts to the top across the main list (BUILD_PLAN).
  const primary = liftRows(split.primary, isOverdueRow);
  const mainRows = primary.filter((r) => !surfacedIds.has(`${r.kind}-${r.id}`));
  const dropdown = split.dropdown;
  const total = primary.length + dropdown.length;

  const showArrows = !!onSaveOrder;
  // Arrows reorder the PRIMARY list only. Active Tasks shows one section, so
  // there is no adjacent section on screen to cross into; they stop at the ends
  // rather than silently moving a task somewhere the panel can't show.
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= mainRows.length) return;
    const next = [...mainRows];
    [next[index], next[j]] = [next[j], next[index]];
    const { tasks, weekly } = splitOrderWrites(next);
    onSaveOrder?.(tasks);
    if (weekly.length > 0) onSaveWeeklyOrder?.(weekly);
  };

  // Both kinds go through one renderer, so the row body is written once and
  // serves the main list, the surfaced group and the dropdown identically.
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
      <WeeklyRow
        w={row.weekly}
        date={today}
        done={weeklyDone(row.weekly.id)}
        onToggle={() =>
          weeklyDone(row.weekly.id)
            ? void weeklyBits?.uncompleteDay?.(row.weekly, today)
            : void weeklyBits?.completeDay?.(row.weekly.id, today)
        }
        onEdit={onEditWeekly}
        onDoubleClick={onWeeklyDoubleClick}
      />
    );

  const chevron = (open: boolean) => (
    <svg
      viewBox="0 0 24 24"
      className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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
            {mainRows.map((row, i) => (
              <ScheduleRow
                key={`${row.kind}-${row.id}`}
                index={i}
                count={mainRows.length}
                label={row.label}
                onMove={move}
                // Single-row: nothing to reorder, and unlike Today's Schedule
                // these arrows never cross sections — so hide the dead pair
                // instead of showing two disabled chevrons.
                showArrows={showArrows && mainRows.length > 1}
              >
                {renderRow(row)}
              </ScheduleRow>
            ))}
          </div>

          {/* Anytime work surfaced by priority (urgent always; medium while the
              section is light). In the main list, but marked as surfaced and
              collapsible by hand. */}
          {surfacedRows.length > 0 && (
            <div className="mt-1.5 border-t border-signal-dim/20 pt-1">
              <button
                onClick={() => setSurfacedOpen((o) => !o)}
                aria-expanded={surfacedOpen}
                className="w-full flex items-center gap-1.5 py-1 font-data text-[11px] text-signal/80 hover:text-signal cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal transition-colors duration-150"
                title="Anytime work surfaced here by its priority — urgent always, medium while this part of the day is light"
              >
                {chevron(surfacedOpen)}
                Anytime · surfaced
                <span className="px-1.5 rounded bg-signal/15 text-signal">{surfacedRows.length}</span>
              </button>
              {surfacedOpen && (
                <div className="divide-y divide-signal-dim/15">
                  {surfacedRows.map((row) => (
                    <div key={`${row.kind}-${row.id}`}>{renderRow(row)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {dropdown.length > 0 && (
            <div className="mt-2 border-t border-signal-dim/20 pt-1.5">
              <button
                onClick={() => setAnytimeOpen((o) => !o)}
                aria-expanded={anytimeOpen}
                className="w-full flex items-center gap-1.5 py-1.5 font-data text-[11px] text-dim hover:text-signal cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal transition-colors duration-150"
              >
                {chevron(anytimeOpen)}
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
