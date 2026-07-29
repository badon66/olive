import { useState } from "react";
import type { Task } from "../../hooks/useTasks";
import { scheduleSort, upcomingDates } from "../../lib/sections";
import { DraggableTask, DropZone } from "./TaskDnd";

function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function monthDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

// Cap on how many tasks a single day block lists before collapsing the rest into
// "+N more" — keeps a heavily-planned day from stretching the row (the block also
// scrolls internally as a backstop).
const MAX_PER_DAY = 4;

// Upcoming Days: today + the next 3 days as 4 blocks side by side, expandable to
// the full week (two rows of 4). Dropping a task on a block sets its due_date to
// that day; bookings keep their time.
export function UpcomingDaysPanel({
  openTasks,
  today,
  onEdit,
  bare = false,
}: {
  openTasks: Task[];
  today: string;
  onEdit: (t: Task) => void;
  // bare: content only — the dashboard's DashSection provides panel + title
  bare?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const dates = upcomingDates(today, expanded ? 7 : 3);

  const expandButton = (
    <button
      onClick={() => setExpanded(!expanded)}
      aria-expanded={expanded}
      aria-label={expanded ? "Show fewer days" : "Show the full week"}
      className="flex items-center gap-1 font-data text-xs text-dim cursor-pointer hover:text-signal transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal rounded px-1"
    >
      {expanded ? "fewer" : "full week"}
      <svg
        viewBox="0 0 24 24"
        className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  const blocks = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {dates.map((date) => {
        const items = openTasks.filter((t) => t.due_date === date).sort(scheduleSort);
        const isToday = date === today;
        return (
          <DropZone
            key={date}
            id={`day:${date}`}
            className={`border rounded-lg px-2 py-2 min-h-[92px] max-h-[220px] overflow-y-auto flex flex-col ${
              isToday ? "border-signal/40" : "border-signal-dim/15"
            }`}
          >
            <div className="flex items-baseline justify-between gap-1 shrink-0">
              <span
                className={`font-display text-[10px] tracking-[0.12em] uppercase ${
                  isToday ? "text-signal text-glow" : "text-signal"
                }`}
              >
                {isToday ? "Today" : weekdayName(date)}
              </span>
              <span className="font-data text-[10px] text-dim">{monthDay(date)}</span>
            </div>
            {items.length === 0 ? (
              <span className="text-dim/40 text-xs mt-2">—</span>
            ) : (
              <div className="mt-1.5 space-y-1 min-w-0">
                {items.slice(0, MAX_PER_DAY).map((t) => (
                  <DraggableTask key={t.id} zone="day" task={t}>
                    <button
                      onClick={() => onEdit(t)}
                      className="w-full text-left flex items-center gap-1.5 text-[13px] leading-tight font-body cursor-grab active:cursor-grabbing hover:text-signal transition-colors duration-150"
                    >
                      <span className="w-1 h-1 rounded-full bg-signal-dim shrink-0" />
                      <span className="truncate">{t.title}</span>
                      {t.scheduled_time && (
                        <span className="font-data text-[9px] text-dim shrink-0">{t.scheduled_time.slice(0, 5)}</span>
                      )}
                    </button>
                  </DraggableTask>
                ))}
                {items.length > MAX_PER_DAY && (
                  <p className="text-dim/60 text-[11px]">+{items.length - MAX_PER_DAY} more</p>
                )}
              </div>
            )}
          </DropZone>
        );
      })}
    </div>
  );

  if (bare) {
    return (
      <>
        <div className="flex justify-end mb-1">{expandButton}</div>
        {blocks}
      </>
    );
  }

  return (
    <section className="hud-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">Upcoming Days</h3>
        {expandButton}
      </header>
      {blocks}
    </section>
  );
}
