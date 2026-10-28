import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryStore } from "../../hooks/useCategories";
import { useChecklistStore } from "../../hooks/useChecklists";
import type { JobStore } from "../../hooks/useJobs";
import type { ReminderStore } from "../../hooks/useReminders";
import type { Task, TaskStore } from "../../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../../hooks/useWeeklyTasks";
import { buildActiveRows } from "../../lib/activeRows";
import { agoLabel, isStale } from "../../lib/cache";
import { dayCounter, dueOnDay } from "../../lib/daySchedule";
import { addDays, edmontonActiveDay, edmontonMinutes, edmontonToday, fullDateLabel } from "../../lib/dates";
import { dayIsDone, schedulingMode } from "../../lib/flexible";
import { doneTodayCount } from "../../lib/sections";
import { primeAudio } from "../../lib/sounds";
import { currentSection } from "../../lib/suggest";
import { ChatBar } from "../ChatBar";
import { CustomizeToggle } from "../CustomizeToggle";
import { JobForm } from "../JobForm";
import { ModalShell } from "../ModalShell";
import { Orb } from "../Orb";
import { ReminderForm } from "../ReminderForm";
import { TaskForm } from "../TaskForm";
import { WeeklyTaskForm } from "../WeeklyTasksView";
import { JobSheet } from "./JobsPhone";
import { NowTab } from "./NowTab";
import { FinanceTab, MORE_PAGES, MoreTab, RemindersTab } from "./OtherTabs";
import { PhoneContext, type MorePage, type PhoneCtx, type PhoneTab, type Sheet } from "./PhoneContext";
import { TaskSheet, WeeklySheet } from "./TaskSheet";
import { TodayTab } from "./TodayTab";
import { IconBell, IconChevron, IconFinance, IconMic, IconMore, IconNow, IconToday } from "./icons";

// THE PHONE APP (BUILD_PLAN "Phone app"): a quick one-handed check-in tool,
// not a squeezed desktop. Under 700px wide, or a phone turned sideways.
//
// Same brain, different face: the stores passed in are the desktop's own
// objects, and every rule (Active Tasks, the day's schedule, the arrows, the
// quick actions, priorities, checklists, days left) comes from the shared
// lib/ functions and hooks. Only this presentation layer is phone-specific.

const TABS: { key: PhoneTab; label: string; icon: (c: string) => ReactNode }[] = [
  { key: "now", label: "Now", icon: (c) => <IconNow className={c} /> },
  { key: "today", label: "Today", icon: (c) => <IconToday className={c} /> },
  { key: "reminders", label: "Reminders", icon: (c) => <IconBell className={c} /> },
  { key: "finance", label: "Finance", icon: (c) => <IconFinance className={c} /> },
  { key: "more", label: "More", icon: (c) => <IconMore className={c} /> },
];

const MAX_BACK = -3;
const MAX_FWD = 7;
const UNDO_MS = 5_000;

type Toast = { id: number; text: string; undo?: () => void };

function dayWord(offset: number, iso: string): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return fullDateLabel(iso).split(",")[0];
}
// "Oct 28" — short, so the date and the day's counter fit on one line beside
// the arrows on a 390px-wide phone.
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function monthDay(iso: string): string {
  return MONTH_DAY.format(new Date(`${iso}T12:00:00Z`));
}

export function PhoneApp({
  taskStore,
  weeklyStore,
  categoryStore,
  jobStore,
  reminderStore,
  customize,
  onToggleCustomize,
  online = true,
}: {
  taskStore: TaskStore;
  weeklyStore: WeeklyStore;
  categoryStore: CategoryStore;
  jobStore: JobStore;
  reminderStore: ReminderStore;
  customize: boolean;
  onToggleCustomize: () => void;
  online?: boolean;
}) {
  // A fresh launch always opens on Now; while the app stays open it remembers
  // the tab (plain state — deliberately not persisted).
  const [tab, setTab] = useState<PhoneTab>("now");
  const [page, setPage] = useState<MorePage | null>(null);
  const [dayOffset, setDayOffsetState] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toastState, setToastState] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const checklist = useChecklistStore();

  // A real clock, re-read every 30 s and the moment the app returns to the
  // foreground (a phone left in a pocket overnight must not show yesterday).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const iv = setInterval(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const today = edmontonToday(now);
  const activeDay = edmontonActiveDay(now);
  const nowSection = currentSection(now);
  const nowMinutes = edmontonMinutes(now);
  const open = useMemo(() => taskStore.tasks.filter((t) => t.status === "open"), [taskStore.tasks]);
  const viewDate = addDays(today, dayOffset);

  const toast = useCallback((text: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), text, undo });
    toastTimer.current = window.setTimeout(() => setToastState(null), UNDO_MS);
  }, []);

  // Tap the checkbox = complete, instantly, with a "Completed · Undo" toast.
  // The writes are the desktop's own: a pick-days task ticks off ONE day.
  const toggleTask = useCallback(
    (task: Task, date: string) => {
      const perDay = schedulingMode(task) === "pick";
      const done = perDay ? dayIsDone(task, date) : task.status === "completed";
      if (done) {
        void (perDay ? taskStore.uncompleteTaskDay(task.id, date) : taskStore.reopenTask(task.id));
        return;
      }
      if (perDay) {
        void taskStore.completeTaskDay(task.id, date);
        toast(`Completed · ${task.title}`, () => void taskStore.uncompleteTaskDay(task.id, date));
      } else {
        void taskStore.completeTask(task.id);
        toast(`Completed · ${task.title}`, () => void taskStore.reopenTask(task.id));
      }
    },
    [taskStore, toast],
  );
  const toggleWeekly = useCallback(
    (weekly: WeeklyTask, date: string, done: boolean) => {
      if (done) {
        void weeklyStore.uncompleteDay(weekly, date);
        return;
      }
      void weeklyStore.completeDay(weekly.id, date);
      toast(`Completed · ${weekly.name}`, () => void weeklyStore.uncompleteDay(weekly, date));
    },
    [weeklyStore, toast],
  );

  const goTab = useCallback((t: PhoneTab, p: MorePage | null = null) => {
    setTab(t);
    setPage(t === "more" ? p : null);
  }, []);

  const ctx: PhoneCtx = {
    taskStore,
    weeklyStore,
    categoryStore,
    jobStore,
    reminderStore,
    now,
    today,
    activeDay,
    nowSection,
    nowMinutes,
    open,
    customize,
    dayOffset,
    setDayOffset: (fn) => setDayOffsetState((o) => Math.max(MAX_BACK, Math.min(MAX_FWD, fn(o)))),
    viewDate,
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    goTab,
    toast,
    toggleTask,
    toggleWeekly,
  };

  // ── Header summary: "4 to do now · 3 done today" ──────────────────────────
  const active = buildActiveRows<Task, WeeklyTask>({
    section: nowSection,
    dueToday: dueOnDay(open, activeDay, true),
    today: activeDay,
    weeklyTasks: weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    dayOverrides: weeklyStore.dayOverrides,
  });
  const isRowDone = (r: (typeof active.mainRows)[number]) =>
    r.kind === "task" ? dayIsDone(r.task, activeDay) : active.isWeeklyDone(r.weekly.id);
  const toDoNow = [...active.mainRows, ...active.surfacedRows].filter((r) => !isRowDone(r)).length;
  const doneToday =
    doneTodayCount(taskStore.tasks, today) +
    weeklyStore.checkins.filter((c) => c.date === today && c.status === "completed").length;
  const summary = `${toDoNow} to do now · ${doneToday} done today`;

  // ── Freshness: "Updated 3 min ago" once the data is stale or offline ──────
  const stamps = [taskStore.syncedAt, weeklyStore.syncedAt, jobStore.syncedAt, reminderStore.syncedAt].filter(
    (x): x is number => x !== null,
  );
  const syncedAt = stamps.length ? Math.min(...stamps) : null;
  const stale = isStale(syncedAt, now.getTime(), !online);
  const freshness = stale && syncedAt ? `${online ? "" : "Offline · "}updated ${agoLabel(syncedAt, now.getTime())}` : null;

  // Today tab's counter, from the same dayCounter as desktop.
  const counter = dayCounter({
    allTasks: taskStore.tasks,
    dueList: dueOnDay(open, viewDate, viewDate === today),
    weeklyTasks: weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    date: viewDate,
  });

  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);

  const iconBtn =
    "w-11 h-11 grid place-items-center rounded-lg text-dim enabled:active:bg-signal/10 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-signal";

  let center: ReactNode;
  if (tab === "today") {
    center = (
      <div className="flex items-center gap-0.5">
        <button className={iconBtn} disabled={dayOffset <= MAX_BACK} onClick={() => ctx.setDayOffset((o) => o - 1)} aria-label="Previous day">
          <IconChevron dir="left" className="w-5 h-5" />
        </button>
        <button
          onClick={() => ctx.setDayOffset(() => 0)}
          className="flex-1 min-w-0 min-h-[44px] text-center rounded-lg focus-visible:outline-2 focus-visible:outline-signal"
          aria-label={dayOffset === 0 ? "Showing today" : "Back to today"}
        >
          <span className={`block font-display text-[14px] tracking-[0.12em] uppercase ${dayOffset === 0 ? "text-signal" : "text-hud"}`}>
            {dayWord(dayOffset, viewDate)}
          </span>
          <span className="block font-data text-[11px] text-dim truncate">
            {monthDay(viewDate)} · {counter.total} task{counter.total === 1 ? "" : "s"} · {counter.done} done
          </span>
        </button>
        <button className={iconBtn} disabled={dayOffset >= MAX_FWD} onClick={() => ctx.setDayOffset((o) => o + 1)} aria-label="Next day">
          <IconChevron dir="right" className="w-5 h-5" />
        </button>
      </div>
    );
  } else if (tab === "reminders") {
    const on = reminderStore.globallyEnabled;
    center = (
      <div className="flex items-center gap-3">
        <span className="flex-1 font-display text-[14px] tracking-[0.18em] uppercase text-hud">Reminders</span>
        <button
          onClick={() => void reminderStore.setGloballyEnabled(!on)}
          aria-pressed={on}
          aria-label={on ? "Reminders active — turn all off" : "Reminders off — turn all on"}
          className="flex items-center gap-2 min-h-[44px] px-1"
        >
          <span className={`font-data text-[12px] ${on ? "text-signal" : "text-amber"}`}>{on ? "Active" : "Off"}</span>
          <span className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${on ? "bg-signal-dim" : "bg-panel-border"}`} aria-hidden="true">
            <span
              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-hud transition-transform duration-200 ease-[var(--ease-spring)]"
              style={{ transform: on ? "translateX(20px)" : "none" }}
            />
          </span>
        </button>
      </div>
    );
  } else if (tab === "more" && page) {
    center = (
      <div className="flex items-center gap-1">
        <button className={iconBtn} onClick={() => setPage(null)} aria-label="Back to More">
          <IconChevron dir="left" className="w-5 h-5" />
        </button>
        <span className="font-display text-[13px] tracking-[0.16em] uppercase text-hud truncate">
          {MORE_PAGES.find((p) => p.key === page)?.label}
        </span>
      </div>
    );
  } else {
    center = (
      <div className="min-w-0">
        <p className="font-display text-[13px] tracking-[0.14em] uppercase text-hud truncate">{dateLine}</p>
        <p className="font-data text-[12px] text-dim truncate">
          {summary}
          {freshness && <span className="text-amber"> · {freshness}</span>}
        </p>
      </div>
    );
  }

  const captureDate = tab === "today" ? viewDate : today;

  return (
    <PhoneContext.Provider value={ctx}>
      {/* iOS allows audio only after a touch: the first tap anywhere primes
          every alert sound (lib/sounds primeAudio), so a reminder can ring. */}
      <div className="phone fixed inset-0 flex flex-col bg-void text-hud touch-manipulation" onPointerDownCapture={primeAudio}>
        <header
          className="shrink-0 border-b border-panel-border bg-void"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
        >
          <div className="flex items-center gap-2 pl-3 pr-2 min-h-[58px] landscape:min-h-[48px]">
            <span className="shrink-0" aria-hidden="true">
              <Orb size={30} />
            </span>
            <div className="flex-1 min-w-0">{center}</div>
            <CustomizeToggle on={customize} onToggle={onToggleCustomize} />
          </div>
          {tab === "today" && freshness && (
            <p className="px-4 pb-1.5 -mt-1 font-data text-[11px] text-amber">{freshness}</p>
          )}
        </header>

        <main className="flex-1 min-h-0 relative" style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
          {tab === "now" && <NowTab />}
          {tab === "today" && <TodayTab />}
          {tab === "reminders" && <RemindersTab />}
          {tab === "finance" && <FinanceTab />}
          {tab === "more" && <MoreTab page={page} />}
        </main>

        {/* Bottom tab bar — thumb-reachable, icon + label, the active tab lit. */}
        <nav
          className="shrink-0 border-t border-panel-border bg-void"
          style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
          aria-label="Sections"
        >
          <div className="grid grid-cols-5">
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => goTab(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex flex-col landscape:flex-row items-center justify-center gap-0.5 landscape:gap-1.5 min-h-[56px] landscape:min-h-[44px] font-data text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
                    on ? "text-signal" : "text-dim"
                  }`}
                >
                  <span
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-signal transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                  {t.icon("w-6 h-6 landscape:w-5 landscape:h-5")}
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Floating mic — on every tab, above the tab bar on the right. */}
        <button
          onClick={() => setSheet({ kind: "capture" })}
          aria-label="Capture — tell Olive"
          className="fixed z-30 right-4 w-14 h-14 rounded-full grid place-items-center bg-signal-dim text-hud border border-signal shadow-[0_6px_18px_rgba(0,0,0,0.5)] active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-hud"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)", right: "calc(env(safe-area-inset-right) + 16px)" }}
        >
          <IconMic className="w-6 h-6" />
        </button>

        {/* "Completed · Undo" — a 5-second safety net for accidental taps. */}
        {toastState && (
          <div
            key={toastState.id}
            role="status"
            aria-live="polite"
            className="fixed z-40 left-3 right-[88px] flex items-center gap-2 min-h-[52px] pl-4 pr-1.5 rounded-xl border border-signal/50 bg-[#0B1912] shadow-[0_10px_28px_rgba(0,0,0,0.6)] motion-safe:animate-toast-in"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
          >
            <span className="flex-1 min-w-0 font-body text-[15px] text-hud truncate">{toastState.text}</span>
            {toastState.undo && (
              <button
                onClick={() => {
                  toastState.undo?.();
                  window.clearTimeout(toastTimer.current);
                  setToastState(null);
                }}
                className="shrink-0 min-h-[44px] px-4 rounded-lg font-display text-[12px] tracking-[0.14em] uppercase text-signal"
              >
                Undo
              </button>
            )}
          </div>
        )}

        {/* Bottom sheets — every popup on the phone (ModalShell). */}
        {sheet?.kind === "task" && <TaskSheet task={sheet.task} date={sheet.date} />}
        {sheet?.kind === "weekly" && <WeeklySheet weekly={sheet.weekly} date={sheet.date} />}
        {sheet?.kind === "job" && <JobSheet jobId={sheet.jobId} />}
        {sheet?.kind === "editTask" && (
          <TaskForm
            initial={taskStore.tasks.find((t) => t.id === sheet.task.id) ?? sheet.task}
            categories={categoryStore.categories}
            onClose={() => setSheet(null)}
            onSubmit={async (input) => {
              await taskStore.updateTask(sheet.task.id, input);
            }}
            onDelete={async () => {
              await taskStore.deleteTask(sheet.task.id);
            }}
            onComplete={taskStore.completeTask}
          />
        )}
        {sheet?.kind === "addTask" && (
          <TaskForm
            categories={categoryStore.categories}
            defaults={sheet.defaults}
            jobName={sheet.defaults.job_id ? jobStore.jobs.find((j) => j.id === sheet.defaults.job_id)?.name : undefined}
            onClose={() => setSheet(null)}
            onSubmit={(input) => taskStore.addTask(input)}
          />
        )}
        {sheet?.kind === "editWeekly" && (
          <WeeklyTaskForm
            initial={sheet.weekly}
            checklistDate={sheet.date}
            occurrenceDone={weeklyStore.checkins.some(
              (c) => c.weekly_task_id === sheet.weekly.id && c.date === sheet.date && c.status === "completed",
            )}
            onCompleteDay={(id, date) => void weeklyStore.completeDay(id, date)}
            onClose={() => setSheet(null)}
            onDelete={async () => {
              await weeklyStore.deleteWeeklyTask(sheet.weekly.id);
            }}
            onSubmit={async (input) => {
              await weeklyStore.updateWeeklyTask(sheet.weekly.id, input);
            }}
          />
        )}
        {sheet?.kind === "addWeekly" && (
          <WeeklyTaskForm onClose={() => setSheet(null)} onSubmit={(input) => weeklyStore.addWeeklyTask(input)} />
        )}
        {sheet?.kind === "editJob" && (
          <JobForm
            initial={sheet.job ?? undefined}
            categories={categoryStore.categories}
            onClose={() => setSheet(null)}
            onSubmit={async (input) => {
              if (sheet.job) await jobStore.updateJob(sheet.job.id, input);
              else await jobStore.addJob(input);
            }}
            onDelete={
              sheet.job
                ? async () => {
                    await jobStore.deleteJob(sheet.job!.id);
                    await taskStore.refresh();
                  }
                : undefined
            }
          />
        )}
        {sheet?.kind === "reminder" && (
          <ReminderForm
            initial={sheet.reminder ?? undefined}
            onClose={() => setSheet(null)}
            onSubmit={async (input) => {
              if (sheet.reminder) await reminderStore.updateReminder(sheet.reminder.id, input);
              else await reminderStore.addReminder(input);
            }}
            onDelete={
              sheet.reminder
                ? async () => {
                    await reminderStore.deleteReminder(sheet.reminder!.id);
                  }
                : undefined
            }
          />
        )}
        {sheet?.kind === "capture" && (
          <ModalShell label="Tell Olive" onClose={() => setSheet(null)} className="px-5 pb-5 pt-1 space-y-3">
            <div>
              <h2 className="font-display text-signal text-[14px] tracking-[0.2em] uppercase">Tell Olive</h2>
              <p className="font-data text-[12px] text-dim mt-1">
                Type, tap the mic, or use the keyboard's mic. New tasks land on{" "}
                <span className="text-hud">{captureDate === today ? "today" : fullDateLabel(captureDate)}</span> unless you say a day.
                You'll see what Olive understood before anything saves.
              </p>
            </div>
            <ChatBar
              inline
              alwaysPreview
              speech
              autoFocus
              forDate={captureDate}
              onReply={(text) => toast(text)}
              onActionDone={async () => {
                setSheet(null);
                await Promise.all([taskStore.refresh(), categoryStore.refresh(), jobStore.refresh(), reminderStore.refresh(), checklist?.refresh()]);
              }}
              taskTitleById={(id) => taskStore.tasks.find((t) => t.id === id)?.title}
            />
          </ModalShell>
        )}
      </div>
    </PhoneContext.Provider>
  );
}
