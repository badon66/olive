import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { scheduleSort, type TimeSection } from "../../lib/sections";
import { appearsToday } from "../../lib/weekly";
import { TaskCard } from "../TaskCard";
import { DraggableTask, DropZone } from "./TaskDnd";

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

// Live snapshot of ONLY the current part of the day (midday tasks at midday,
// afternoon tasks in the afternoon) — distinct from the fuller Today's Schedule.
export function ActiveTasksPanel({
  section,
  dueToday,
  cardProps,
  weeklyBits,
}: {
  section: TimeSection;
  dueToday: Task[];
  cardProps: CardProps;
  weeklyBits?: { weeklyTasks: WeeklyTask[]; checkins: WeeklyCheckin[] };
}) {
  const today = cardProps.today;
  const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
  const checkinsFor = (id: string) => (weeklyBits?.checkins ?? []).filter((c) => c.weekly_task_id === id);
  const weeklyNow = (weeklyBits?.weeklyTasks ?? []).filter(
    (t) => (t.time_section ?? "anytime") === section && appearsToday(t, checkinsFor(t.id), today),
  );

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
          {weeklyNow.map((t) => {
            const done = checkinsFor(t.id).some((c) => c.date === today && c.status === "completed");
            return (
              <div key={t.id} className="flex items-center gap-2 py-1.5">
                <span className={`flex-1 min-w-0 truncate font-body text-sm ${done ? "opacity-50 line-through" : ""}`}>
                  {t.name}
                </span>
                <span className="hud-chip shrink-0">weekly</span>
              </div>
            );
          })}
          {items.map((t) => (
            <DraggableTask key={t.id} zone="active" task={t}>
              <TaskCard task={t} {...cardProps} category={cardProps.categoryOf?.(t)} />
            </DraggableTask>
          ))}
        </div>
      )}
    </DropZone>
  );
}
