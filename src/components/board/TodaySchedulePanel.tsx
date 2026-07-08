import type { Task } from "../../hooks/useTasks";
import { SECTION_ORDER, scheduleSort, type TimeSection } from "../../lib/sections";
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
  onDelete: (id: string) => void;
};

// Tasks due today grouped by time_section; each section is a drop target that
// sets due_date=today + time_section on the dropped task.
export function TodaySchedulePanel({ dueToday, cardProps }: { dueToday: Task[]; cardProps: CardProps }) {
  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">
          Today's Schedule
        </h3>
        <span className="hud-chip">{dueToday.length}</span>
      </header>

      {dueToday.length === 0 && <p className="text-dim text-sm py-1.5 mb-1">Clear for today — drag something in.</p>}

      <div className="space-y-2">
        {SECTION_ORDER.map((section) => {
          const items = dueToday.filter((t) => (t.time_section ?? "anytime") === section).sort(scheduleSort);
          // Empty non-anytime sections stay visible but slim — they're drop targets
          return (
            <DropZone key={section} id={`section:${section}`} className="border border-signal-dim/15 rounded p-2">
              <p className="font-data text-[11px] text-dim uppercase tracking-widest mb-0.5">
                {SECTION_LABELS[section]}
              </p>
              {items.length === 0 ? (
                <p className="text-dim/50 text-xs py-1">—</p>
              ) : (
                <div className="divide-y divide-signal-dim/15">
                  {items.map((t) => (
                    <DraggableTask key={t.id} zone="sched" task={t}>
                      <TaskCard task={t} {...cardProps} />
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
