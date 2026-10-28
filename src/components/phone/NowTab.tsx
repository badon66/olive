import { useMemo, useState, type ReactNode } from "react";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyTask } from "../../hooks/useWeeklyTasks";
import { useDaySetup } from "../../hooks/useDaySetup";
import { buildActiveRows, buildRows, overdueRow } from "../../lib/activeRows";
import { carryoverTasks } from "../../lib/dayrules";
import { buildDaySchedule, dueOnDay } from "../../lib/daySchedule";
import { moveRow } from "../../lib/rows";
import {
  minutesLeftInSection,
  nextSection,
  sectionClockLabel,
  sectionProgress,
  sectionStartLabel,
  timeLeftLabel,
  type TimeSection,
} from "../../lib/sections";
import { SkeletonRows } from "../Skeleton";
import { jobsInOrder, JobCard } from "./JobsPhone";
import { usePhone } from "./PhoneContext";
import { PhoneRow } from "./PhoneRow";
import { IconChevron, IconPlus } from "./icons";

export const SECTION_NAMES: Record<TimeSection, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  anytime: "Anytime",
};

// A collapsible row at the bottom of the task area ("Anytime (3)").
export function Collapsible({
  label,
  count,
  defaultOpen = false,
  tone = "dim",
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  tone?: "dim" | "signal" | "amber";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = tone === "amber" ? "text-amber" : tone === "signal" ? "text-signal" : "text-dim";
  return (
    <div className="border-t border-panel-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 min-h-[48px] px-4 font-data text-[13px] ${color} focus-visible:outline-2 focus-visible:outline-signal`}
      >
        <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
          <IconChevron className="w-4 h-4" />
        </span>
        <span className="flex-1 text-left">{label}</span>
        <span className="px-2 py-0.5 rounded bg-signal/10">{count}</span>
      </button>
      {open && <div className="divide-y divide-signal-dim/15 pb-1">{children}</div>}
    </div>
  );
}

// NOW — the home screen (BUILD_PLAN "Now tab"). Active Tasks follows every
// desktop rule because it is computed by the same function (buildActiveRows);
// Active Jobs keeps at least the bottom third of the screen.
export function NowTab() {
  const ctx = usePhone();
  const { taskStore, weeklyStore, jobStore, open, today, activeDay, nowSection, nowMinutes, customize, openSheet, goTab } = ctx;
  const { setup } = useDaySetup(activeDay);
  const wake = setup?.wake_time;

  // "What should I be doing right now" runs off the ACTIVE day (5 AM boundary),
  // exactly as desktop Active Tasks does.
  const activeDue = useMemo(() => dueOnDay(open, activeDay, true), [open, activeDay]);
  const a = buildActiveRows<Task, WeeklyTask>({
    section: nowSection,
    dueToday: activeDue,
    today: activeDay,
    weeklyTasks: weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    dayOverrides: weeklyStore.dayOverrides,
  });
  const carryover = useMemo(() => carryoverTasks(open, today), [open, today]);
  const carryRows = buildRows(carryover, [], overdueRow(today));

  // Empty state: what comes next today ("Next: Night · 2 tasks at 11 PM").
  const day = buildDaySchedule<Task, WeeklyTask>({
    viewDate: activeDay,
    today: activeDay,
    dueList: activeDue,
    openTasks: [],
    weeklyTasks: weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    dayOverrides: weeklyStore.dayOverrides,
    historical: false,
    blockedWindows: [],
    prevBedtime: null,
  });
  let next: { section: TimeSection; count: number } | null = null;
  for (let s = nextSection(nowSection); s; s = nextSection(s)) {
    const n = day.rowsFor(s, day.sectionWeekly(s)).length;
    if (n > 0) {
      next = { section: s, count: n };
      break;
    }
  }

  const clock = sectionClockLabel(nowSection, wake);
  const left = timeLeftLabel(minutesLeftInSection(nowSection, nowMinutes, wake));
  const elapsed = sectionProgress(nowSection, nowMinutes, wake);
  const loading = taskStore.loading || weeklyStore.loading;

  const move = (index: number, dir: -1 | 1) => {
    const writes = moveRow(a.mainRows, index, dir);
    if (!writes) return;
    void taskStore.saveOrder(writes.tasks);
    if (writes.weekly.length > 0) void weeklyStore.saveWeeklyOrder(writes.weekly);
  };

  const { active: jobs } = jobsInOrder(jobStore.jobs);

  return (
    <div className="h-full flex flex-col landscape:flex-row">
      {/* TASK AREA — takes what it needs, up to about two-thirds of the
          screen (in landscape, two-thirds of the width), scrolling on its own. */}
      <section
        aria-label="Active tasks"
        className="min-h-0 shrink overflow-y-auto overscroll-contain max-h-[66%] landscape:max-h-none landscape:h-full landscape:basis-[64%] landscape:shrink-0"
      >
        {/* The current part of the day: name, clock range, time left, and a
            progress line that fills as it elapses (transform only). */}
        <div className="mx-3 mt-3 rounded-xl border border-signal/40 bg-signal/[0.06] px-4 pt-3 pb-3.5 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[17px] tracking-[0.12em] uppercase text-signal">{SECTION_NAMES[nowSection]}</h2>
            <span className="flex-1" />
            {left && <span className="font-data text-[14px] text-hud whitespace-nowrap">{left}</span>}
            {customize && (
              <button
                onClick={() => openSheet({ kind: "addTask", defaults: { due_date: activeDay } })}
                aria-label="Add a task"
                className="w-11 h-11 -my-2 -mr-2 grid place-items-center rounded-lg text-signal"
              >
                <IconPlus />
              </button>
            )}
          </div>
          {clock && <p className="font-data text-[12.5px] text-dim mt-0.5">{clock}</p>}
          <span className="absolute left-0 right-0 bottom-0 h-1 bg-signal/10" aria-hidden="true" />
          <span
            className="absolute left-0 bottom-0 h-1 w-full origin-left bg-signal transition-transform duration-700"
            style={{ transform: `scaleX(${elapsed})` }}
            aria-hidden="true"
          />
          <span className="sr-only">{Math.round(elapsed * 100)}% through {SECTION_NAMES[nowSection]}</span>
        </div>

        <div className="mt-1">
          {loading ? (
            <div className="px-4 py-2">
              <SkeletonRows count={3} />
            </div>
          ) : a.total === 0 ? (
            <div className="px-5 py-5 text-center">
              <p className="font-body font-semibold text-[18px] text-hud">Nothing scheduled right now</p>
              <p className="font-data text-[13px] text-dim mt-1">
                {next
                  ? `Next: ${SECTION_NAMES[next.section]}, ${next.count} task${next.count === 1 ? "" : "s"} at ${sectionStartLabel(next.section, wake)}`
                  : "Nothing else planned today."}
              </p>
            </div>
          ) : (
            <>
              {a.promoted && (
                <p className="px-4 pt-1 font-data text-[11px] text-dim/80">
                  Nothing set for {SECTION_NAMES[nowSection].toLowerCase()} — showing anytime work
                </p>
              )}
              <div className="divide-y divide-signal-dim/15">
                {a.mainRows.map((r, i) => (
                  <PhoneRow
                    key={`${r.kind}-${r.id}`}
                    row={r}
                    date={activeDay}
                    index={i}
                    count={a.mainRows.length}
                    onMove={a.mainRows.length > 1 ? move : undefined}
                  />
                ))}
              </div>
              {a.surfacedRows.length > 0 && (
                <Collapsible label="Anytime · surfaced by priority" count={a.surfacedRows.length} defaultOpen tone="signal">
                  {a.surfacedRows.map((r) => (
                    <PhoneRow key={`${r.kind}-${r.id}`} row={r} date={activeDay} />
                  ))}
                </Collapsible>
              )}
            </>
          )}
          {a.dropdown.length > 0 && (
            <Collapsible label="Anytime" count={a.dropdown.length}>
              {a.dropdown.map((r) => (
                <PhoneRow key={`${r.kind}-${r.id}`} row={r} date={activeDay} />
              ))}
            </Collapsible>
          )}
          {carryRows.length > 0 && (
            <Collapsible label="Carryover" count={carryRows.length} tone="amber">
              {carryRows.map((r) => (
                <PhoneRow key={`${r.kind}-${r.id}`} row={r} date={today} />
              ))}
            </Collapsible>
          )}
        </div>
      </section>

      {/* JOBS AREA — always at least the bottom third; takes any leftover
          room when the task list is short; scrolls on its own. */}
      <section
        aria-label="Active jobs"
        className="flex-1 min-h-[33%] overflow-y-auto overscroll-contain border-t border-signal/25 bg-[rgba(10,26,18,0.35)] landscape:min-h-0 landscape:border-t-0 landscape:border-l"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 min-h-[48px] bg-void/95 border-b border-panel-border/60">
          {/* Sideways, this is a narrow side column: "Jobs (4)" keeps it one line. */}
          <h2 className="font-display text-[12px] tracking-[0.2em] uppercase text-signal whitespace-nowrap">
            <span className="landscape:hidden">Active jobs</span>
            <span className="hidden landscape:inline">Jobs</span> ({jobs.length})
          </h2>
          <button
            onClick={() => goTab("more", "jobs")}
            className="inline-flex items-center gap-1 min-h-[44px] px-2 font-data text-[13px] text-signal whitespace-nowrap"
          >
            See all <IconChevron className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-3 pt-2 pb-28 space-y-2">
          {jobStore.loading ? (
            <SkeletonRows count={2} compact />
          ) : jobs.length === 0 ? (
            <p className="text-dim text-[14px] px-1 py-2">No active jobs.</p>
          ) : (
            jobs.map((j) => <JobCard key={j.id} job={j} compact />)
          )}
        </div>
      </section>
    </div>
  );
}
