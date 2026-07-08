import type { Task } from "../../hooks/useTasks";
import { dayBlockDates, scheduleSort } from "../../lib/sections";
import { DraggableTask, DropZone } from "./TaskDnd";

function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function monthDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

// Next 7 days as individual day blocks, Monday-first. Dropping a task on a
// block sets its due_date to that day.
export function DayBlocksPanel({
  openTasks,
  today,
  onEdit,
}: {
  openTasks: Task[];
  today: string;
  onEdit: (t: Task) => void;
}) {
  const dates = dayBlockDates(today);
  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">Next 7 Days</h3>
      </header>
      <div className="space-y-1.5">
        {dates.map((date) => {
          const items = openTasks.filter((t) => t.due_date === date).sort(scheduleSort);
          return (
            <DropZone key={date} id={`day:${date}`} className="border border-signal-dim/15 rounded px-2.5 py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[11px] tracking-[0.15em] uppercase text-signal w-9 shrink-0">
                  {weekdayName(date)}
                </span>
                <span className="font-data text-[11px] text-dim shrink-0 w-12">{monthDay(date)}</span>
                {items.length === 0 ? (
                  <span className="text-dim/50 text-xs">—</span>
                ) : (
                  <span className="hud-chip shrink-0">{items.length}</span>
                )}
              </div>
              {items.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((t) => (
                    <DraggableTask key={t.id} zone="day" task={t}>
                      <button
                        onClick={() => onEdit(t)}
                        className="w-full text-left flex items-center gap-2 text-sm font-body cursor-grab active:cursor-grabbing hover:text-signal transition-colors duration-150 truncate"
                      >
                        <span className="w-1 h-1 rounded-full bg-signal-dim shrink-0" />
                        <span className="truncate">{t.title}</span>
                        {t.scheduled_time && (
                          <span className="font-data text-[10px] text-dim shrink-0">
                            {t.scheduled_time.slice(0, 5)}
                          </span>
                        )}
                      </button>
                    </DraggableTask>
                  ))}
                  {items.length > 3 && (
                    <p className="text-dim/60 text-xs pl-3">+{items.length - 3} more</p>
                  )}
                </div>
              )}
            </DropZone>
          );
        })}
      </div>
    </section>
  );
}
