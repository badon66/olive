import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { CategoryStore } from "../hooks/useCategories";
import type { JobStore } from "../hooks/useJobs";
import type { ReminderStore } from "../hooks/useReminders";
import type { Task, TaskStore } from "../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../hooks/useWeeklyTasks";
import { carryoverTasks } from "../lib/dayrules";
import { activeCount } from "../lib/jobs";
import { useBrief } from "../hooks/useBrief";
import { addDays, daysBetween, edmontonActiveDay, edmontonHour, edmontonToday, fullDateLabel } from "../lib/dates";
import { buildInsight } from "../lib/insight";
import { computeSections, doneTodayCount } from "../lib/sections";
import { currentSection } from "../lib/suggest";
import { CategoryPanelBody } from "./CategoryPanel";
import { TaskActionPopup } from "./TaskActionPopup";
import { ChatBar } from "./ChatBar";
import { CustomizeToggle } from "./CustomizeToggle";
import { DashSection } from "./DashSection";
import { Orb } from "./Orb";
import { RolloverCountdown } from "./RolloverCountdown";
import { RemindersPanel } from "./RemindersView";
import { ScheduleSetupButton } from "./ScheduleSetup";
import { TaskForm } from "./TaskForm";
import { WeeklyTaskForm, WeeklyTasksView } from "./WeeklyTasksView";
import { ActiveJobsPanel } from "./board/ActiveJobsPanel";
import { ActiveTasksPanel } from "./board/ActiveTasksPanel";
import { UpcomingDaysPanel } from "./board/DayBlocksPanel";
import { DropZone, TaskDndProvider, useActiveDrag } from "./board/TaskDnd";
import { DayNavigator, TodaySchedulePanel } from "./board/TodaySchedulePanel";

const OFFSET_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven"];
// Dynamic label for the schedule day-stepper, both directions.
function dayOffsetLabel(o: number): string {
  if (o === 0) return "Today";
  if (o === -1) return "Previous day";
  if (o === 1) return "Next day";
  const w = OFFSET_WORDS[Math.abs(o)] ?? String(Math.abs(o));
  const word = w.charAt(0).toUpperCase() + w.slice(1);
  return o < 0 ? `${word} days ago` : `In ${w} days`;
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning, Keenan";
  if (hour < 17) return "Good afternoon, Keenan";
  return "Good evening, Keenan";
}

// Weekly panel hint while dragging a task over it (conversion, with undo)
function WeeklyDropHint() {
  const active = useActiveDrag();
  if (!active) return null;
  return (
    <p className="font-data text-[10px] text-signal/70 mb-1.5">
      {active.kind === "task"
        ? `drop to make "${active.task.title}" weekly`
        : `drop to unschedule "${active.weekly.name}"`}
    </p>
  );
}

export function DesktopDashboard({
  taskStore,
  weeklyStore,
  categoryStore,
  jobStore,
  reminderStore,
  onOpenJobs,
  onOpenReminders,
  customize,
  onToggleCustomize,
}: {
  taskStore: TaskStore;
  weeklyStore: WeeklyStore;
  categoryStore: CategoryStore;
  jobStore: JobStore;
  reminderStore: ReminderStore;
  onOpenJobs: () => void;
  onOpenReminders: () => void;
  customize: boolean;
  onToggleCustomize: () => void;
}) {
  const { tasks, loading } = taskStore;
  const { brief, loading: briefLoading, error, regenerate } = useBrief();
  const [editing, setEditing] = useState<Task | null>(null);
  const [addWeekly, setAddWeekly] = useState(false);
  // One "add a task" modal, driven by whatever defaults the caller supplies —
  // a category panel, the schedule's viewed day, or a specific job.
  const [addTaskFor, setAddTaskFor] = useState<
    { category_id?: string; due_date?: string; job_id?: string } | null
  >(null);
  const [actionFor, setActionFor] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Previous-day navigation for Today's Schedule: 0 = today, down to -3.
  const [scheduleOffset, setScheduleOffset] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Two boundaries, deliberately different (CLAUDE.md): `today` is the page you
  // are on (flips 1:30 AM); `activeDay` is the day whose Night is still running
  // (flips 5:00 AM). Between 1:30 and 5:00 they differ, and that is correct.
  const today = edmontonToday(now);
  const activeDay = edmontonActiveDay(now);
  const nowSection = currentSection(now);
  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const sections = useMemo(() => computeSections(open, today), [open, today]);
  const doneToday = useMemo(() => doneTodayCount(tasks, today), [tasks, today]);

  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  const edmontonHourNow = edmontonHour(now);
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const insight = useMemo(
    () =>
      buildInsight({
        open,
        today,
        activeDay,
        nowSection,
        nowTime,
        doneToday,
        overdue: sections.overdue.length,
        dueToday: sections.today.length,
      }),
    [open, today, activeDay, nowSection, nowTime, doneToday, sections.overdue.length, sections.today.length],
  );

  const status =
    sections.overdue.length > 0
      ? `${sections.overdue.length} overdue item${sections.overdue.length === 1 ? "" : "s"}`
      : "Everything is on track";

  const generatedAt = brief
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" }).format(
        new Date(brief.generated_at),
      )
    : null;

  const cardProps = {
    today,
    onComplete: taskStore.completeTask,
    onReopen: taskStore.reopenTask,
    onEdit: setEditing,
    // Triple-click → "Delete for today" / "Reschedule" (BUILD_PLAN). Flows through
    // cardProps, so it reaches Today's Schedule, Active Tasks and Upcoming Days
    // without each panel wiring it separately.
    onTripleClick: setActionFor,
    categoryOf: (t: Task) => categoryStore.byId.get(t.category_id),
  };

  const dueToday = [...sections.overdue, ...sections.today];

  // Active Tasks answers "what should I be doing right now", so it runs off
  // `activeDay`, not the page day. Identical to `dueToday` except in the 1:30–5:00
  // AM window, where the page has flipped but the previous day's Night is still on.
  const activeDue = useMemo(() => {
    if (activeDay === today) return dueToday;
    const s = computeSections(open, activeDay);
    return [...s.overdue, ...s.today];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeDay, today, sections]);
  const activeCardProps = { ...cardProps, today: activeDay };

  // Carryover: opted-in one-off tasks the rollover cron rolled into today, plus
  // any still sitting overdue if the cron hasn't run. Its own nudge button —
  // never blended with generic overdue or with weekly-task planning.
  const carryover = useMemo(() => carryoverTasks(open, today), [open, today]);

  // Which day the detailed Today's Schedule panel is showing. Bidirectional:
  // back up to 3 days, forward up to a week. Any non-today day shows its real
  // due tasks (a read-back grouping, no pull-forward/weekly).
  const MAX_BACK = -3;
  const MAX_FWD = 7;
  const scheduleDate = addDays(today, scheduleOffset);
  const otherDay = scheduleOffset !== 0;
  const scheduleDue = otherDay ? open.filter((t) => t.due_date === scheduleDate) : dueToday;
  const dayNav = {
    label: dayOffsetLabel(scheduleOffset),
    date: scheduleDate,
    canBack: scheduleOffset > MAX_BACK,
    canForward: scheduleOffset < MAX_FWD,
    onBack: () => setScheduleOffset((o) => Math.max(MAX_BACK, o - 1)),
    onForward: () => setScheduleOffset((o) => Math.min(MAX_FWD, o + 1)),
    onToday: () => setScheduleOffset(0),
    isToday: scheduleOffset === 0,
    inHeader: true,
    // "Historical" means the day is genuinely OVER — strictly before the active
    // day. Two consequences, both deliberate:
    //  • Between 1:30 and 5:00 AM the previous day is one step back but its Night
    //    is still running, so it keeps the live ribbon and the "now" highlight.
    //  • FUTURE days are not historical — they get the full ribbon too, which is
    //    what makes weekly tasks render on them (BUILD_PLAN). Previously any
    //    non-today day fell into the read-back view, which skips weekly entirely.
    historical: scheduleDate < activeDay,
  };

  // Upcoming Days blocks and the arrows drive the SAME "which day" state — one
  // system, not two. Clicking a block navigates the detailed schedule to it.
  const selectDay = (date: string) =>
    setScheduleOffset(Math.max(MAX_BACK, Math.min(MAX_FWD, daysBetween(today, date))));

  // Header ALWAYS carries the real date — "Today's Schedule — July 27th" when on
  // today, the full weekday+date otherwise. Never a bare label with no date.
  const scheduleTitle =
    scheduleOffset === 0
      ? `Today's Schedule — ${fullDateLabel(scheduleDate).split(", ")[1]}`
      : `${fullDateLabel(scheduleDate)} Schedule`;

  // Two-way task ↔ weekly conversion, each returning an undo closure
  const convertTaskToWeekly = async (task: Task) => {
    const { data: wt, error: werr } = await supabase
      .from("weekly_tasks")
      .insert({
        user_id: task.user_id,
        name: task.title,
        recurrence_mode: "fixed_days" as const,
        scheduled_days: [0, 1, 2, 3, 4, 5, 6],
        time_section: task.time_section,
      })
      .select("id")
      .single();
    if (werr) throw werr;
    await supabase.from("tasks").delete().eq("id", task.id);
    await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    return async () => {
      await supabase.from("weekly_tasks").delete().eq("id", wt.id);
      await supabase.from("tasks").insert(task);
      await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    };
  };

  const convertWeeklyToTask = async (weekly: WeeklyTask, categoryId: string) => {
    const { data: history } = await supabase.from("weekly_task_checkins").select("*").eq("weekly_task_id", weekly.id);
    const { data: created, error: terr } = await supabase
      .from("tasks")
      .insert({
        user_id: weekly.user_id,
        title: weekly.name,
        category_id: categoryId,
        time_section: weekly.time_section,
      })
      .select("id")
      .single();
    if (terr) throw terr;
    await supabase.from("weekly_tasks").delete().eq("id", weekly.id);
    await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    return async () => {
      await supabase.from("tasks").delete().eq("id", created.id);
      await supabase.from("weekly_tasks").insert(weekly);
      if (history?.length) await supabase.from("weekly_task_checkins").insert(history);
      await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    };
  };

  return (
    <TaskDndProvider
      tasks={open}
      weeklyTasks={weeklyStore.weeklyTasks}
      deps={{
        today,
        updateTask: taskStore.updateTask,
        setWeeklySection: (id, s) => weeklyStore.updateWeeklyTask(id, { time_section: s }),
        planWeeklyDay: (id, date) => weeklyStore.planDay(id, date),
        convertTaskToWeekly,
        convertWeeklyToTask,
      }}
    >
      <div className="min-h-dvh flex flex-col text-[13px]">
        {/* Sticky top bar — stays in view while the page scrolls underneath. The
            customize pencil lives HERE (a real header child) so the sticky bar
            can't paint over it — the earlier absolute pencil sat behind it. */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-2.5 gap-4 shrink-0 bg-void/85 backdrop-blur-md border-b border-panel-border">
          <span className={`text-[13px] ${sections.overdue.length > 0 ? "text-amber" : "text-dim"}`}>{status}</span>
          <div className="flex items-center gap-3">
            <RolloverCountdown />
            <ScheduleSetupButton onTasksChanged={taskStore.refresh} />
            <div className="flex items-center gap-3 font-data text-[11px]">
              <span className="text-dim">{dateStr}</span>
              <span className="text-signal">{timeStr}</span>
            </div>
            <CustomizeToggle on={customize} onToggle={onToggleCustomize} />
          </div>
        </header>

        {/* FIXED LAYOUT (BUILD_PLAN) — not user-rearrangeable. pt-5 gives the first
            row clear breathing room below the sticky header. */}
        <div className="px-6 pt-5 pb-6 flex flex-col gap-3">
          {/* Flanking row: the left and right columns run the FULL height of the
              centre unit (orb + capture box together), not just the orb. */}
          {/* Row height is pinned to the centre unit (orb 380 + capture box) so the
              flanks match IT and scroll internally, rather than a long schedule
              stretching the whole row. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)_minmax(0,1fr)] gap-3 items-stretch lg:h-[640px]">
            {/* LEFT flank — Active Tasks, with Active Jobs closing any height gap */}
            <div className="flex flex-col gap-3 h-full min-h-0">
              {/* Firm 50/50 split — Active Jobs gets its own half, it doesn't
                  just absorb whatever Active Tasks leaves over. */}
              <DashSection title="Active Tasks" customize={customize} className="basis-1/2 grow-0 shrink-0 min-h-0">
                <ActiveTasksPanel
                  section={nowSection}
                  dueToday={activeDue}
                  cardProps={activeCardProps}
                  weeklyBits={weeklyStore}
                  onSaveOrder={taskStore.saveOrder}
                  onSaveWeeklyOrder={weeklyStore.saveWeeklyOrder}
                />
              </DashSection>
              <DashSection
                title="Active Jobs"
                customize={customize}
                hint={<span className="hud-chip">{activeCount(jobStore.jobs)}</span>}
                className="basis-1/2 grow-0 shrink-0 min-h-0"
              >
                <ActiveJobsPanel
                  jobs={jobStore.jobs}
                  tasks={tasks}
                  today={today}
                  categoryStore={categoryStore}
                  onOpen={onOpenJobs}
                  onEditStatus={(id, status) => void jobStore.updateJob(id, { status })}
                  onAddTask={(jobId) => setAddTaskFor({ job_id: jobId })}
                  customize={customize}
                />
              </DashSection>
            </div>

            {/* CENTRE unit — orb at full size, capture box directly beneath it */}
            <div className="flex flex-col items-center justify-center gap-2 h-full">
              <Orb size={380} />
              <p className="font-display text-[26px] font-medium tracking-wide text-hud -mt-3 text-center">
                {greeting(edmontonHourNow)}
              </p>
              {/* What actually matters right now: next booking, else the top
                  item in this part of day, with a real progress stat */}
              <p className="text-[15px] text-hud/90 leading-snug text-center max-w-[460px]">
                {loading || briefLoading ? "Pulling up your day…" : insight.headline}
              </p>
              <p className="font-data text-[11px] text-dim tracking-wide text-center flex items-center gap-2">
                {loading || briefLoading ? "" : insight.stat}
                {/* Rehomed from the deleted Priorities header — the brief still
                    needs a regenerate control, it just has no panel of its own now. */}
                <button
                  onClick={() => void regenerate()}
                  className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
                  aria-label="Regenerate brief"
                >
                  {briefLoading ? "…" : generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
                </button>
              </p>
              {error && <p className="text-amber text-xs">{error} — showing live data.</p>}
              <div className="w-full max-w-[520px] mt-1">
                <ChatBar
                  onActionDone={async () => {
                    await Promise.all([taskStore.refresh(), categoryStore.refresh(), jobStore.refresh()]);
                  }}
                  inline
                  taskTitleById={(id) => tasks.find((t) => t.id === id)?.title}
                />
              </div>
            </div>

            {/* RIGHT flank — Today's Schedule, full height of the centre unit */}
            <DashSection
              title={scheduleTitle}
              customize={customize}
              onAdd={() => setAddTaskFor({ due_date: scheduleDate })}
              hint={
                <span className="flex items-center gap-2">
                  <span className="hud-chip">{scheduleDue.length}</span>
                  <DayNavigator nav={dayNav} />
                </span>
              }
              className="h-full min-h-0"
            >
              <TodaySchedulePanel
                bare
                dueToday={scheduleDue}
                openTasks={otherDay ? [] : open}
                cardProps={cardProps}
                weeklyBits={otherDay ? undefined : weeklyStore}
                carryover={otherDay ? [] : carryover}
                dayNav={dayNav}
                onMoveSection={(id, section) => taskStore.updateTask(id, { time_section: section })}
                onSaveOrder={taskStore.saveOrder}
                onSaveWeeklyOrder={weeklyStore.saveWeeklyOrder}
                nowSection={nowSection}
                activeDay={activeDay}
              />
            </DashSection>
          </div>

          {/* Finance — full width edge to edge, deliberately taller than a normal panel */}
          <DashSection
            title="Finance"
            customize={customize}
            hint={<span className="hud-chip">soon</span>}
            className="min-h-[150px]"
          >
            <p className="text-dim text-xs py-1">Balance and spending land here in Phase 6.</p>
          </DashSection>

          {/* Below Finance — Weekly Tasks (left) | Upcoming Days → Reminders (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <DropZone id="weekly">
              <DashSection
                title="Weekly Tasks"
                customize={customize}
                onAdd={() => setAddWeekly(true)}
                hint={<span className="hud-chip">{weeklyStore.weeklyTasks.length}</span>}
              >
                <WeeklyDropHint />
                <WeeklyTasksView {...weeklyStore} bare customize={customize} />
              </DashSection>
            </DropZone>

            <div className="flex flex-col gap-3">
              <DashSection title="Upcoming Days" customize={customize}>
                <UpcomingDaysPanel
                  bare
                  tasks={tasks}
                  today={today}
                  onEdit={setEditing}
                  selectedDate={scheduleDate}
                  onSelectDay={selectDay}
                  weeklyTasks={weeklyStore.weeklyTasks}
                  checkins={weeklyStore.checkins}
                  categoryOf={cardProps.categoryOf}
                />
              </DashSection>
              {/* Compact and low-priority per spec — a glance at what's coming,
                  never a core panel. Its own grid cell, so it can't overlap. */}
              <DashSection
                title="Reminders"
                customize={customize}
                onAdd={onOpenReminders}
                hint={<span className="hud-chip">{reminderStore.reminders.filter((r) => r.active).length}</span>}
              >
                <RemindersPanel store={reminderStore} onAdd={onOpenReminders} />
              </DashSection>
            </div>
          </div>

          {/* Row 6 — the category panels, bottom of the page */}
          <div className="grid grid-cols-1 lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 items-start">
            {categoryStore.categories.map((cat) => (
              <DashSection
                key={cat.id}
                title={cat.name}
                customize={customize}
                onAdd={() => setAddTaskFor({ category_id: cat.id })}
                className="border-l-[3px]"
                hint={
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}` }}
                      aria-hidden="true"
                    />
                    <span className="hud-chip">{open.filter((t) => t.category_id === cat.id).length}</span>
                  </span>
                }
              >
                <CategoryPanelBody
                  category={cat}
                  tasks={tasks}
                  cardProps={cardProps}
                />
              </DashSection>
            ))}
          </div>
        </div>

        {actionFor && (
          <TaskActionPopup
            task={actionFor}
            onClose={() => setActionFor(null)}
            // "Delete for today" = off today's schedule, not destroyed. The task
            // drops back to its category's backlog with no due date.
            onUnschedule={(id) => void taskStore.updateTask(id, { due_date: null })}
            onReschedule={(id, date) => void taskStore.updateTask(id, { due_date: date })}
          />
        )}

        {editing && (
          <TaskForm
            initial={editing}
            categories={categoryStore.categories}
            onClose={() => setEditing(null)}
            onSubmit={async (input) => {
              await taskStore.updateTask(editing.id, input);
            }}
            onDelete={async () => {
              await taskStore.deleteTask(editing.id);
            }}
          />
        )}

        {addWeekly && (
          <WeeklyTaskForm
            onClose={() => setAddWeekly(false)}
            onSubmit={async (input) => {
              await weeklyStore.addWeeklyTask(input);
            }}
          />
        )}
        {addTaskFor && (
          <TaskForm
            categories={categoryStore.categories}
            defaults={addTaskFor}
            jobName={addTaskFor.job_id ? jobStore.jobs.find((j) => j.id === addTaskFor.job_id)?.name : undefined}
            onClose={() => setAddTaskFor(null)}
            onSubmit={async (input) => {
              await taskStore.addTask(input);
            }}
          />
        )}
      </div>
    </TaskDndProvider>
  );
}
