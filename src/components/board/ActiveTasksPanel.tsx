import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { orderBySortOrder, overdueFirst, scheduleSort, type TimeSection } from "../../lib/sections";
import { appearsOn } from "../../lib/weekly";
import { TaskCard } from "../TaskCard";
import { combineRows, ScheduleRow, splitOrderWrites } from "./ScheduleRow";
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
};

type WeeklyBits = {
  weeklyTasks: WeeklyTask[];
  checkins: WeeklyCheckin[];
  completeDay?: (id: string, date: string) => Promise<WeeklyCheckin | null>;
  uncompleteDay?: (task: WeeklyTask, date: string) => Promise<void>;
};

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
}) {
  const today = cardProps.today;
  const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
  // Active Tasks shows one section, so the arrows reorder within it. There is no
  // adjacent section on screen here, so they stop at the ends rather than
  // silently moving a task somewhere the panel can't show.
  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  const weeklyNow = (weeklyBits?.weeklyTasks ?? []).filter(
    (t) => (t.time_section ?? "anytime") === section && appearsOn(t, checkinsFor(t.id), today),
  );

  // ONE combined list of everything this panel renders — regular tasks and
  // weekly occurrences together — so the arrows move an item relative to what is
  // actually on screen, not just its own kind.
  const rows = combineRows<Task, WeeklyTask>(
    // Overdue first (BUILD_PLAN), then manual/schedule order within each group.
    overdueFirst(orderBySortOrder(items), today).map((t) => ({ kind: "task" as const, id: t.id, label: t.title, sort: t.sort_order, task: t })),
    weeklyNow.map((w) => ({ kind: "weekly" as const, id: w.id, label: w.name, sort: w.sort_order, weekly: w })),
  );
  const showArrows = !!onSaveOrder;
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    const { tasks, weekly } = splitOrderWrites(next);
    onSaveOrder?.(tasks);
    if (weekly.length > 0) onSaveWeeklyOrder?.(weekly);
  };

  return (
    <DropZone id={`section:${section}`} className="h-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="hud-chip hud-chip-signal">{SECTION_LABELS[section]} — right now</span>
        <span className="hud-chip">{items.length + weeklyNow.length}</span>
      </div>
      {items.length === 0 && weeklyNow.length === 0 ? (
        <p className="text-dim text-sm py-1.5">Nothing scheduled for this part of the day.</p>
      ) : (
        <div className="divide-y divide-signal-dim/15">
          {/* BOTH kinds go through ScheduleRow — the arrow block is written once
              and never branches on item type. */}
          {rows.map((row, i) => {
            const inner =
              row.kind === "task" ? (
                <DraggableTask zone="active" task={row.task} className="py-1">
                  <TaskCard
                    task={row.task}
                    {...cardProps}
                    category={cardProps.categoryOf?.(row.task)}
                    descriptionMode="always"
                  />
                </DraggableTask>
              ) : (
                (() => {
                  const w = row.weekly;
                  const done = checkinsFor(w.id).some((c) => c.date === today && c.status === "completed");
                  return (
                    <div className="flex items-center gap-3 py-3"
                        onDoubleClick={() => onWeeklyDoubleClick?.(w, today)}
                      >
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
                      <span className="hud-chip shrink-0">weekly</span>
                    </div>
                  );
                })()
              );
            return (
              <ScheduleRow
                key={`${row.kind}-${row.id}`}
                index={i}
                count={rows.length}
                label={row.label}
                onMove={move}
                showArrows={showArrows}
              >
                {inner}
              </ScheduleRow>
            );
          })}
        </div>
      )}
    </DropZone>
  );
}
