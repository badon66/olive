import { useState } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyCheckin, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { addDays, formatClock } from "../../lib/dates";
import { orderBySortOrder, SECTION_ORDER, type TimeSection } from "../../lib/sections";
import { appearsOn } from "../../lib/weekly";
import { DraggableTask, DropZone } from "./TaskDnd";

const SECTION_LABELS: Record<TimeSection, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  anytime: "Anytime",
};

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

// How many tasks a block lists before collapsing the rest into "+N more".
const MAX_PER_DAY = 10;
// Days revealed per press of "more days".
const BATCH = 3;

// Upcoming Days: a rich 3-block base — yesterday, today, tomorrow — with room to
// show each day's actual tasks and whether they're done. "More days" reveals the
// next 3 forward in rows below, repeatable. Clicking a block navigates Today's
// Schedule to that day (same shared state the header arrows drive).
export function UpcomingDaysPanel({
  tasks,
  today,
  onEdit,
  bare = false,
  selectedDate,
  onSelectDay,
  weeklyTasks = [],
  checkins = [],
  categoryOf,
}: {
  // All tasks (not just open) — completion state is part of the point here
  tasks: Task[];
  today: string;
  onEdit: (t: Task) => void;
  // bare: content only — the dashboard's DashSection provides panel + title
  bare?: boolean;
  selectedDate?: string;
  onSelectDay?: (date: string) => void;
  // Weekly tasks render inline in each day they belong to, same as regular ones
  weeklyTasks?: WeeklyTask[];
  checkins?: WeeklyCheckin[];
  categoryOf?: (t: Task) => { name: string; color: string } | undefined;
}) {
  // How many extra batches of 3 days are revealed beyond the base row.
  const [batches, setBatches] = useState(0);

  const base = [addDays(today, -1), today, addDays(today, 1)];
  // Each extra batch continues forward from the furthest day already shown.
  const extra = Array.from({ length: batches * BATCH }, (_, i) => addDays(today, 2 + i));
  const rows: string[][] = [base];
  for (let i = 0; i < batches; i++) rows.push(extra.slice(i * BATCH, i * BATCH + BATCH));

  const block = (date: string) => {
    const items = orderBySortOrder(tasks.filter((t) => t.due_date === date));
    // Weekly tasks belonging to this day render inline, exactly like regular
    // tasks (BUILD_PLAN) — not a separate list that only knows about "today".
    const weeklyHere = weeklyTasks.filter((w) =>
      appearsOn(w, checkins.filter((c) => c.weekly_task_id === w.id), date),
    );
    const isToday = date === today;
    const isSelected = date === selectedDate;
    const done = items.filter((t) => t.status === "completed").length;
    const total = items.length + weeklyHere.length;

    // Grouped under section dividers. UPCOMING DAYS ONLY: an empty section is
    // hidden entirely rather than shown as a bare divider — this panel is meant
    // to be glanceable. Everywhere else (Today's Schedule) keeps all sections.
    // SECTION_ORDER already ends with "anytime" — appending it again rendered
    // every anytime task TWICE under two identical dividers (with duplicate
    // React keys).
    const sectionsWithContent = [...SECTION_ORDER]
      .map((section) => ({
        section,
        tasks: items.filter((t) => (t.time_section ?? "anytime") === section),
        weekly: weeklyHere.filter((w) => (w.time_section ?? "anytime") === section),
      }))
      .filter((g) => g.tasks.length + g.weekly.length > 0);

    return (
      <DropZone
        key={date}
        id={`day:${date}`}
        className={`border rounded-lg px-4 py-3.5 min-h-[320px] flex flex-col transition duration-200 ${
          isSelected
            ? "border-signal bg-signal/[0.07] shadow-[0_0_14px_rgba(63,169,104,0.22)]"
            : isToday
              ? "border-signal/40"
              : "border-signal-dim/15"
        }`}
      >
        <button
          onClick={() => onSelectDay?.(date)}
          disabled={!onSelectDay}
          aria-label={`Show ${date} in the schedule`}
          aria-pressed={isSelected}
          className={`flex items-baseline justify-between gap-1 shrink-0 w-full text-left rounded ${
            onSelectDay ? "cursor-pointer" : "cursor-default"
          } focus-visible:outline-2 focus-visible:outline-signal`}
        >
          <span
            className={`font-display text-base tracking-[0.1em] uppercase ${
              isToday ? "text-signal text-glow" : "text-signal"
            }`}
          >
            {isToday ? "Today" : weekdayName(date)}
          </span>
          <span className="font-data text-xs text-dim">{monthDay(date)}</span>
        </button>

        {total > 0 && (
          <p className="font-data text-[11px] text-dim/80 mt-1 shrink-0">
            {done}/{total} done
          </p>
        )}

        {sectionsWithContent.length === 0 ? (
          <span className="text-dim/40 text-sm mt-3">—</span>
        ) : (
          <div className="mt-2.5 space-y-3 min-w-0 overflow-y-auto">
            {(() => {
              let budget = MAX_PER_DAY;
              return sectionsWithContent.map((g) => {
                if (budget <= 0) return null;
                const rows = [...g.tasks, ...g.weekly].slice(0, budget);
                budget -= rows.length;
                return (
                  <div key={g.section}>
                    <p className="font-data text-[10px] uppercase tracking-widest text-dim/60 mb-1 pb-0.5 border-b border-signal-dim/15">
                      {SECTION_LABELS[g.section]}
                    </p>
                    <div className="space-y-1.5">
                      {rows.map((row) => {
                        const isWeekly = !("status" in row);
                        const t = row as Task;
                        const w = row as WeeklyTask;
                        const isDone = !isWeekly && t.status === "completed";
                        const label = isWeekly ? w.name : t.title;
                        const cat = isWeekly ? undefined : categoryOf?.(t);
                        const inner = (
                          <span
                            className={`w-full text-left flex items-center gap-2 text-[15px] leading-snug font-body py-0.5 ${
                              isDone ? "opacity-45" : ""
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full shrink-0 grid place-items-center border ${
                                isDone ? "border-signal bg-signal/30" : "border-signal-dim"
                              }`}
                              aria-hidden="true"
                            >
                              {isDone && (
                                <svg viewBox="0 0 24 24" className="w-2 h-2 text-signal" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                            <span className={`truncate ${isDone ? "line-through" : ""}`}>{label}</span>
                            {isWeekly && <span className="hud-chip shrink-0 !text-[9px]">weekly</span>}
                            {cat && (
                              <span
                                className="shrink-0 hidden xl:inline-flex items-center px-1.5 py-px rounded-sm font-data text-[9px] tracking-wide uppercase"
                                style={{ color: cat.color, background: `${cat.color}1f`, border: `1px solid ${cat.color}55` }}
                              >
                                {cat.name}
                              </span>
                            )}
                            {!isWeekly && t.scheduled_time && (
                              <span className="font-data text-[10px] text-dim shrink-0 ml-auto">
                                {formatClock(t.scheduled_time)}
                              </span>
                            )}
                          </span>
                        );
                        // Weekly rows are display-only here; regular tasks stay
                        // draggable and open the edit modal on a single click.
                        return isWeekly ? (
                          <div key={`w-${w.id}`}>{inner}</div>
                        ) : (
                          <DraggableTask key={t.id} zone="day" task={t}>
                            <button
                              onClick={() => onEdit(t)}
                              // cursor-pointer, not cursor-grab: this is a BUTTON whose
                              // click opens the edit modal — the grab cursor promised a
                              // drag and hid the click affordance (drag still works via
                              // the wrapping DraggableTask).
                              className="w-full cursor-pointer hover:text-signal transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-signal"
                            >
                              {inner}
                            </button>
                          </DraggableTask>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
            {total > MAX_PER_DAY && <p className="text-dim/60 text-xs">+{total - MAX_PER_DAY} more</p>}
          </div>
        )}
      </DropZone>
    );
  };

  const body = (
    // Dropped down a little from the header to give the row room to breathe
    <div className="pt-2 space-y-2.5">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {row.map(block)}
        </div>
      ))}

      <div className="flex justify-center gap-3 pt-0.5">
        <button
          onClick={() => setBatches((b) => b + 1)}
          className="font-data text-[11px] text-dim hover:text-signal cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal rounded px-2 py-1"
        >
          + more days
        </button>
        {batches > 0 && (
          <button
            onClick={() => setBatches(0)}
            className="font-data text-[11px] text-dim/70 hover:text-signal cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal rounded px-2 py-1"
          >
            collapse
          </button>
        )}
      </div>
    </div>
  );

  if (bare) return body;

  return (
    <section className="hud-panel p-4">
      <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">Upcoming Days</h3>
      {body}
    </section>
  );
}
