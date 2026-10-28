import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { CategoryStore } from "../hooks/useCategories";
import { useChecklistStore } from "../hooks/useChecklists";
import type { JobStore } from "../hooks/useJobs";
import type { ReminderStore } from "../hooks/useReminders";
import type { Task, TaskStore } from "../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../hooks/useWeeklyTasks";
import { carryoverTasks } from "../lib/dayrules";
import { dayIsDone } from "../lib/flexible";
import { activeCount } from "../lib/jobs";
import { useBrief } from "../hooks/useBrief";
import { PORTRAIT_MONITOR_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { addDays, daysBetween, edmontonActiveDay, edmontonHour, edmontonMinutes, edmontonToday, fullDateLabel } from "../lib/dates";
import { buildInsight } from "../lib/insight";
import { dayCounter, dueOnDay } from "../lib/daySchedule";
import { taskActionHandlers } from "../hooks/useTaskActions";
import { computeSections, doneTodayCount } from "../lib/sections";
import { currentSection } from "../lib/suggest";
import { CategoryPanelBody } from "./CategoryPanel";
import { TaskActionPopup, type ActionTarget } from "./TaskActionPopup";
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
  // Double-click target: a regular task OR a weekly occurrence on a given day.
  const [actionFor, setActionFor] = useState<ActionTarget | null>(null);
  // Single-click on a weekly occurrence in Active Tasks / Today's Schedule opens
  // its popup for THAT day — checklist first, the only place items are ticked.
  const [editWeekly, setEditWeekly] = useState<{ weekly: WeeklyTask; date: string } | null>(null);
  const checklist = useChecklistStore();
  const [now, setNow] = useState(() => new Date());
  // Previous-day navigation for Today's Schedule: 0 = today, down to -3.
  const [scheduleOffset, setScheduleOffset] = useState(0);
  // Third layout target (CLAUDE.md): a desktop monitor rotated to portrait.
  // Same query as the `tall:` CSS variant, so the DOM order chosen here and the
  // styling chosen there always flip together.
  const tall = useMediaQuery(PORTRAIT_MONITOR_QUERY);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Layout C (BUILD_PLAN): the main area fills EXACTLY the viewport minus the
  // sticky top bar. The bar's height follows its content (orb, greeting, the
  // capture box, chips), so it is measured rather than assumed — a guessed
  // pixel height would leave a gap or a scrollbar the moment a line wraps.
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(72);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
  // Still to do today. A pick task already ticked off for today stays visible
  // (struck through) but is no longer "due" — it was being counted as both.
  const dueTodayOpen = useMemo(
    () => sections.today.filter((t) => !dayIsDone(t, today)).length,
    [sections.today, today],
  );

  // 12-hour with AM/PM everywhere Olive renders a time (CLAUDE.md) — this
  // header clock was the last 24-hour holdout.
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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
        dueToday: dueTodayOpen,
      }),
    [open, today, activeDay, nowSection, nowTime, doneToday, sections.overdue.length, dueTodayOpen],
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
    // Pick-days tasks tick off ONE day at a time; the panels supply which day.
    onCompleteDay: taskStore.completeTaskDay,
    onUncompleteDay: taskStore.uncompleteTaskDay,
    onEdit: setEditing,
    // Double-click → task actions / weekly skip (BUILD_PLAN). Flows through
    // cardProps, so it reaches Today's Schedule, Active Tasks and Upcoming Days
    // without each panel wiring it separately.
    // The row's day travels with it, so the popup acts on THAT day.
    onDoubleClick: (t: Task, date?: string) => setActionFor({ kind: "task", task: t, date: date ?? today }),
    categoryOf: (t: Task) => categoryStore.byId.get(t.category_id),
  };

  const dueToday = [...sections.overdue, ...sections.today];

  // The panels hand back weekly occurrences already RESOLVED for their day. The
  // action popup needs the pattern's own row instead, so its "usual name"
  // placeholder and its reset-to-normal refer to the real task, not to the
  // override currently in force.
  const baseWeekly = (w: WeeklyTask) => weeklyStore.weeklyTasks.find((t) => t.id === w.id) ?? w;

  // Active Tasks answers "what should I be doing right now", so it runs off
  // `activeDay`, not the page day. Identical to `dueToday` except in the 1:30–5:00
  // AM window, where the page has flipped but the previous day's Night is still on.
  const activeDue = useMemo(
    () => (activeDay === today ? dueToday : dueOnDay(open, activeDay, true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, activeDay, today, sections],
  );
  const activeCardProps = { ...cardProps, today: activeDay };

  // NOTHING places flexible tasks any more. A window task belongs to every day
  // of its range and a pick task to every day chosen, so there is no day to
  // choose and no reason to move one — which is also what removed the drifting
  // dates. Day membership is decided at render time by occursOn().

  // Carryover is MANUAL (no cron bumps anything): opted-in tasks overdue, plus
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
  // One rule for "what belongs to this day", whichever day is on screen.
  const scheduleDue = otherDay ? dueOnDay(open, scheduleDate, false) : dueToday;
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
        priority_weight: task.priority_weight,
      })
      .select("id")
      .single();
    if (werr) throw werr;
    // The checklist travels with it — moved BEFORE the delete, which would
    // otherwise cascade the items away.
    await checklist?.moveItems({ task_id: task.id }, { weekly_task_id: wt.id });
    await supabase.from("tasks").delete().eq("id", task.id);
    await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    return async () => {
      await supabase.from("tasks").insert(task);
      await checklist?.moveItems({ weekly_task_id: wt.id }, { task_id: task.id });
      await supabase.from("weekly_tasks").delete().eq("id", wt.id);
      await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    };
  };

  const convertWeeklyToTask = async (weekly: WeeklyTask, categoryId: string) => {
    const { data: history } = await supabase.from("weekly_task_checkins").select("*").eq("weekly_task_id", weekly.id);
    // One-day edits cascade-delete with the weekly task, so they are saved too —
    // undo used to bring the task back without them, losing them for good.
    const { data: overrides } = await supabase
      .from("weekly_task_day_overrides")
      .select("*")
      .eq("weekly_task_id", weekly.id);
    const { data: created, error: terr } = await supabase
      .from("tasks")
      .insert({
        user_id: weekly.user_id,
        title: weekly.name,
        category_id: categoryId,
        time_section: weekly.time_section,
        priority_weight: weekly.priority_weight,
      })
      .select("id")
      .single();
    if (terr) throw terr;
    // Checklist items follow the task across (before the cascade delete).
    await checklist?.moveItems({ weekly_task_id: weekly.id }, { task_id: created.id });
    await supabase.from("weekly_tasks").delete().eq("id", weekly.id);
    await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    return async () => {
      await supabase.from("weekly_tasks").insert(weekly);
      await checklist?.moveItems({ task_id: created.id }, { weekly_task_id: weekly.id });
      await supabase.from("tasks").delete().eq("id", created.id);
      if (history?.length) await supabase.from("weekly_task_checkins").insert(history);
      if (overrides?.length) await supabase.from("weekly_task_day_overrides").insert(overrides);
      await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    };
  };

  // Panel bodies shared by the two arrangements below. The ultrawide layout is
  // the BUILD_PLAN one and renders exactly as it did before portrait existed;
  // the portrait branch reuses these same bodies in a different order with
  // different framing, so the two can never drift apart in content.
  const activeTasksBody = (
    <ActiveTasksPanel
      section={nowSection}
      dueToday={activeDue}
      cardProps={activeCardProps}
      weeklyBits={weeklyStore}
      onSaveOrder={taskStore.saveOrder}
      onSaveWeeklyOrder={weeklyStore.saveWeeklyOrder}
      onWeeklyDoubleClick={(w, date) => setActionFor({ kind: "weekly", weekly: baseWeekly(w), date })}
      onEditWeekly={(w, date) => setEditWeekly({ weekly: baseWeekly(w), date })}
      loading={loading || weeklyStore.loading}
    />
  );
  const activeJobsHint = <span className="hud-chip">{activeCount(jobStore.jobs)}</span>;
  const activeJobsBody = (
    <ActiveJobsPanel
      loading={jobStore.loading}
      jobs={jobStore.jobs}
      tasks={tasks}
      today={today}
      categoryStore={categoryStore}
      onOpen={onOpenJobs}
      onEditStatus={(id, status) => void jobStore.updateJob(id, { status })}
      onAddTask={(jobId) => setAddTaskFor({ job_id: jobId })}
      customize={customize}
    />
  );
  // The brief's regenerate control. Rehomed from the deleted Priorities header;
  // it lives beside the insight in both arrangements.
  const regenerateChip = (
    <button
      onClick={() => void regenerate()}
      className={`hud-chip cursor-pointer focus-visible:outline-2 focus-visible:outline-signal ${error ? "hud-chip-amber" : "hud-chip-signal"}`}
      aria-label="Regenerate brief"
      title={error ? `${error} — showing live data.` : "Regenerate the daily brief"}
    >
      {briefLoading ? "…" : generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
    </button>
  );

  // PORTRAIT ONLY (CLAUDE.md): the orb, greeting, insight and capture box as a
  // stacked hero at the top of the single column. The ultrawide view has no
  // orb column any more — its orb, greeting and capture box sit in the sticky
  // top bar (layout C), built inline in the header below.
  const portraitHero = (
    <>
      <Orb size={240} />
      <p className="font-display text-[22px] font-medium tracking-wide text-hud -mt-2 text-center text-balance">
        {greeting(edmontonHourNow)}
      </p>
      {/* What actually matters right now: next booking, else the top
          item in this part of day, with a real progress stat */}
      <p className="text-[15px] text-hud/90 leading-snug text-center max-w-[460px]">
        {loading || briefLoading ? "Pulling up your day…" : insight.headline}
      </p>
      <p className="font-data text-[11px] text-dim tracking-wide text-center flex items-center gap-2">
        {loading || briefLoading ? "" : insight.stat}
        {regenerateChip}
      </p>
      {error && <p className="text-amber text-xs">{error} — showing live data.</p>}
      <div className="w-full max-w-[520px] mt-1">
        <ChatBar
          onActionDone={async () => {
            // Checklist items can arrive with a capture ("X, with A, B and C"),
            // so the checklist store reloads too — or the new "0/3" chip and the
            // popup's items would wait for a page reload.
            await Promise.all([taskStore.refresh(), categoryStore.refresh(), jobStore.refresh(), checklist?.refresh()]);
          }}
          inline
          taskTitleById={(id) => tasks.find((t) => t.id === id)?.title}
        />
      </div>
    </>
  );
  // "8 tasks · 3 completed" for the day on screen (BUILD_PLAN): the day's
  // regular tasks plus its weekly occurrences. A pick task already ticked for
  // the day moves from the open count to the completed one, not both.
  const { total: dayTotal, done: dayDone } = dayCounter({
    allTasks: tasks,
    dueList: scheduleDue,
    weeklyTasks: weeklyStore.weeklyTasks,
    checkins: weeklyStore.checkins,
    date: scheduleDate,
  });
  const scheduleHint = (
    <span className="flex items-center gap-2">
      <span className="hud-chip" aria-label={`${dayTotal} tasks, ${dayDone} completed`}>
        {dayTotal} task{dayTotal === 1 ? "" : "s"} · {dayDone} completed
      </span>
      <DayNavigator nav={dayNav} />
    </span>
  );
  const scheduleBody = (
    <TodaySchedulePanel
      bare
      dueToday={scheduleDue}
      openTasks={otherDay ? [] : open}
      cardProps={cardProps}
      // Weekly occurrences render for today AND future days; only
      // genuinely-past (historical) days go without. Gating on
      // otherDay stripped them from every non-today view — the exact
      // regression the appearsOn() fix was meant to close.
      weeklyBits={scheduleDate < activeDay ? undefined : weeklyStore}
      carryover={otherDay ? [] : carryover}
      dayNav={dayNav}
      onMoveSection={(id, section) => taskStore.updateTask(id, { time_section: section })}
      onPinWeeklySection={
        weeklyStore.overridesReady ? (id, date, s) => weeklyStore.pinWeeklySection(id, date, s) : undefined
      }
      onSaveOrder={taskStore.saveOrder}
      onSaveWeeklyOrder={weeklyStore.saveWeeklyOrder}
      onWeeklyDoubleClick={(w, date) => setActionFor({ kind: "weekly", weekly: baseWeekly(w), date })}
      onEditWeekly={(w, date) => setEditWeekly({ weekly: baseWeekly(w), date })}
      nowSection={nowSection}
      nowMinutes={edmontonMinutes(now)}
      activeDay={activeDay}
      loading={loading || weeklyStore.loading}
    />
  );
  // Finance — the dashboard version keeps the quick diagnostics (balance, today's
  // spend, pace vs goal — Phase 6); the full depth lives on the Finance tab.
  const financeHint = <span className="hud-chip">soon</span>;
  const financeBody = <p className="text-dim text-xs py-1">Balance and spending land here in Phase 6.</p>;
  const financeSection = (
    <DashSection title="Finance" customize={customize} hint={financeHint} className="min-h-[150px]">
      {financeBody}
    </DashSection>
  );
  const weeklySection = (
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
  );
  const upcomingBody = (
    <UpcomingDaysPanel
      bare
      tasks={tasks}
      today={today}
      onEdit={setEditing}
      selectedDate={scheduleDate}
      onSelectDay={selectDay}
      weeklyTasks={weeklyStore.weeklyTasks}
      checkins={weeklyStore.checkins}
      dayOverrides={weeklyStore.dayOverrides}
      categoryOf={cardProps.categoryOf}
    />
  );
  // Compact and low-priority per spec — a glance at what's coming,
  // never a core panel. Its own grid cell, so it can't overlap.
  const remindersSection = (
    <DashSection
      title="Reminders"
      customize={customize}
      onAdd={onOpenReminders}
      hint={<span className="hud-chip">{reminderStore.reminders.filter((r) => r.active).length}</span>}
    >
      <RemindersPanel store={reminderStore} onAdd={onOpenReminders} />
    </DashSection>
  );
  // The category panels — bottom of the page in both arrangements
  const categoryGrid = (
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
            loading={loading}
          />
        </DashSection>
      ))}
    </div>
  );

  return (
    <TaskDndProvider
      tasks={open}
      weeklyTasks={weeklyStore.weeklyTasks}
      deps={{
        today,
        updateTask: taskStore.updateTask,
        // Dragging an occurrence whose DAY has been pinned to a section moves that
        // pin, not the recurring pattern — otherwise the day override keeps winning
        // and the item visibly snaps back. Unpinned days behave exactly as before.
        // The drop carries its own day (Active Tasks = today, the schedule = the
        // day shown). Falls back to the viewed day for "unschedule", which has
        // no day of its own.
        setWeeklySection: (id, s, date) => weeklyStore.moveWeeklySection(id, s, date ?? scheduleDate),
        planWeeklyDay: (id, date) => weeklyStore.planDay(id, date),
        convertTaskToWeekly,
        convertWeeklyToTask,
      }}
    >
      <div className="min-h-dvh flex flex-col text-[13px]">
        {/* Sticky top bar — stays in view while the page scrolls underneath. The
            customize pencil lives HERE (a real header child) so the sticky bar
            can't paint over it — the earlier absolute pencil sat behind it. */}
        <header
          ref={headerRef}
          className="sticky top-0 z-30 flex items-center gap-4 px-6 py-2 shrink-0 bg-void/85 backdrop-blur-md border-b border-panel-border"
        >
          {/* LAYOUT C (BUILD_PLAN, 2026-10-20) — "the orb in the top bar". On the
              main view the sticky bar holds an icon-scale orb, the greeting with
              its one-line insight, and the capture/talk box, so the talk box is
              reachable however far down the page you scroll. The portrait view
              keeps its own orb stack in the body and shows the plain status here. */}
          {tall ? (
            <span className={`text-[13px] ${sections.overdue.length > 0 ? "text-amber" : "text-dim"}`}>{status}</span>
          ) : (
            <>
              <div className="shrink-0 -my-1" aria-hidden="true">
                <Orb size={56} />
              </div>
              <div className="min-w-0 shrink basis-[22rem] max-w-[26vw]">
                <p className="font-display text-[15px] font-medium tracking-wide text-hud truncate">
                  {greeting(edmontonHourNow)}
                </p>
                <p className="text-[12.5px] text-hud/85 leading-snug truncate" title={insight.headline}>
                  {loading || briefLoading ? "Pulling up your day…" : insight.headline}
                </p>
              </div>
              <div className="flex-1 min-w-0 max-w-[720px] mx-auto">
                <ChatBar
          onActionDone={async () => {
            // Checklist items can arrive with a capture ("X, with A, B and C"),
            // so the checklist store reloads too — or the new "0/3" chip and the
            // popup's items would wait for a page reload.
            await Promise.all([taskStore.refresh(), categoryStore.refresh(), jobStore.refresh(), checklist?.refresh()]);
          }}
          inline
          taskTitleById={(id) => tasks.find((t) => t.id === id)?.title}
          toastPlacement="float"
          micHint
        />
              </div>
              {/* The progress stat already names any overdue count ("1/13 done
                  today · 6 overdue"), so the old status line is not repeated. */}
              <div
                className={`hidden xl:flex items-center gap-2 font-data text-[11px] shrink-0 ${
                  sections.overdue.length > 0 ? "text-amber" : "text-dim"
                }`}
              >
                <span>{loading || briefLoading ? "" : insight.stat}</span>
                {regenerateChip}
              </div>
            </>
          )}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <RolloverCountdown />
            <ScheduleSetupButton
              onTasksChanged={async () => {
                await Promise.all([taskStore.refresh(), checklist?.refresh()]);
              }}
            />
            <div className="flex items-center gap-3 font-data text-[11px]">
              <span className="text-dim">{dateStr}</span>
              <span className="text-signal">{timeStr}</span>
            </div>
            <CustomizeToggle on={customize} onToggle={onToggleCustomize} />
          </div>
        </header>

        {tall ? (
          /* PORTRAIT MONITOR (CLAUDE.md third target) — a rotated 24" at ~1080
             wide, where the three-column flank cannot fit. One column, ordered
             by how often the eye comes back to each panel during a working day
             on a SIDE monitor: the top of a tall screen is where a glance lands,
             the bottom needs a deliberate look down.
               1. orb (shrunk) + capture — identity, the one-line insight, input
                  (the ultrawide view keeps these in the sticky top bar instead)
               2. Active Tasks — "what now": shortest, most time-sensitive list
               3. Today's Schedule — the panel that wins the vertical room
               4. Weekly Tasks — checked off a few times a day
               5. Upcoming Days — planning horizon; also the schedule's day-picker
               6. Active Jobs | Reminders — change rarely, glance-only
               7. Finance (placeholder until Phase 6), then the category backlogs */
          <div className="px-6 pt-4 pb-8 flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              {portraitHero}
            </div>

            <DashSection title="Active Tasks" customize={customize}>
              {activeTasksBody}
            </DashSection>

            {/* Generous height as a viewport share, so a taller monitor gives it
                more, and a MIN rather than a cap: a packed day extends the panel
                instead of scrolling inside it. The slots grow to fill the room
                (TodaySchedulePanel's `tall:` classes) rather than sitting at the
                top of a hollow panel — spare space becomes drop-target area. */}
            <DashSection
              title={scheduleTitle}
              customize={customize}
              onAdd={() => setAddTaskFor({ due_date: scheduleDate })}
              hint={scheduleHint}
              className="min-h-[42vh]"
              bodyClassName="flex flex-col"
            >
              {scheduleBody}
            </DashSection>

            {weeklySection}

            <DashSection title="Upcoming Days" customize={customize}>
              {upcomingBody}
            </DashSection>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4 items-start">
              <DashSection title="Active Jobs" customize={customize} hint={activeJobsHint}>
                {activeJobsBody}
              </DashSection>
              {remindersSection}
            </div>

            {financeSection}
            {categoryGrid}
          </div>
        ) : (
        /* LAYOUT C (BUILD_PLAN, 2026-10-20) — fixed, not user-rearrangeable.
           Replaces the four-column top row. On load, Active Tasks, Today's
           Schedule, Active Jobs and Finance are all on screen with no scrolling:

             ┌ sticky top bar: orb · greeting + insight · capture box · clocks ┐
             │ Active Tasks        │ Today's Schedule    │ Active Jobs         │
             │ (same height ───────┼─────────────────────┤ (narrowest column,  │
             │ Finance, spanning both of the above       │  full height)       │
             └───────────────────────────── exactly 100dvh − header ──────────┘
             below the fold: Weekly Tasks | Upcoming Days → Reminders; categories

           The first screen's height is the viewport minus the MEASURED header
           (see headerRef) — nothing in it is a fixed pixel height. Inside it a
           grid: two rows (the lists take the free height, Finance a viewport
           share with a 150px floor) and three columns (the two lists share the
           free width, Active Jobs gets the smallest share with a 300px floor).
           Every panel is min-h-0 and scrolls inside its own box (DashSection's
           body), so no column can grow the page. */
        <>
          <div className="px-6 py-3" style={{ height: `calc(100dvh - ${headerH}px)` }}>
            <div className="h-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(300px,0.42fr)] grid-rows-[minmax(0,1fr)_minmax(150px,16%)] gap-3">
              {/* Active Tasks — left, same height as the schedule */}
              <DashSection title="Active Tasks" customize={customize} className="min-h-0">
                {activeTasksBody}
              </DashSection>

              {/* Today's Schedule — middle, the full day, scrolling inside its box */}
              <DashSection
                title={scheduleTitle}
                customize={customize}
                onAdd={() => setAddTaskFor({ due_date: scheduleDate })}
                hint={scheduleHint}
                className="min-h-0"
              >
                {scheduleBody}
              </DashSection>

              {/* Active Jobs — far right, narrowest, full height past Finance */}
              <DashSection
                title="Active Jobs"
                customize={customize}
                hint={activeJobsHint}
                className="row-span-2 min-h-0"
              >
                {activeJobsBody}
              </DashSection>

              {/* Finance — directly under the two lists, spanning both */}
              <DashSection title="Finance" customize={customize} hint={financeHint} className="col-span-2 min-h-0">
                {financeBody}
              </DashSection>
            </div>
          </div>

          {/* BELOW THE FOLD — Weekly Tasks (left) | Upcoming Days → Reminders (right), then the category panels */}
          <div className="px-6 pt-1 pb-6 flex flex-col gap-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {weeklySection}

              <div className="flex flex-col gap-3">
                <DashSection title="Upcoming Days" customize={customize}>
                  {upcomingBody}
                </DashSection>
                {remindersSection}
              </div>
            </div>

            {categoryGrid}
          </div>
        </>
        )}

        {actionFor && (
          <TaskActionPopup
            target={actionFor}
            today={today}
            onClose={() => setActionFor(null)}
            // The same handlers the phone's task sheet uses (hooks/useTaskActions).
            {...taskActionHandlers(taskStore, weeklyStore)}
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
            onComplete={taskStore.completeTask}
          />
        )}

        {/* A weekly occurrence opened from Active Tasks / Today's Schedule: its
            popup for THAT day. The checklist (if any) comes first and ticks
            that day's boxes; "Yes" to the all-done prompt checks the day off. */}
        {editWeekly && (
          <WeeklyTaskForm
            initial={editWeekly.weekly}
            checklistDate={editWeekly.date}
            occurrenceDone={weeklyStore.checkins.some(
              (c) => c.weekly_task_id === editWeekly.weekly.id && c.date === editWeekly.date && c.status === "completed",
            )}
            onCompleteDay={(id, date) => void weeklyStore.completeDay(id, date)}
            onClose={() => setEditWeekly(null)}
            onDelete={async () => {
              await weeklyStore.deleteWeeklyTask(editWeekly.weekly.id);
            }}
            onSubmit={async (input) => {
              await weeklyStore.updateWeeklyTask(editWeekly.weekly.id, input);
            }}
          />
        )}

        {addWeekly && (
          <WeeklyTaskForm
            onClose={() => setAddWeekly(false)}
            onSubmit={(input) => weeklyStore.addWeeklyTask(input)}
          />
        )}
        {addTaskFor && (
          <TaskForm
            categories={categoryStore.categories}
            defaults={addTaskFor}
            jobName={addTaskFor.job_id ? jobStore.jobs.find((j) => j.id === addTaskFor.job_id)?.name : undefined}
            onClose={() => setAddTaskFor(null)}
            onSubmit={(input) => taskStore.addTask(input)}
          />
        )}
      </div>
    </TaskDndProvider>
  );
}
