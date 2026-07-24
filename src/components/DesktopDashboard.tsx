import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { CategoryStore } from "../hooks/useCategories";
import type { Task, TaskStore } from "../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../hooks/useWeeklyTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { edmontonToday } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import { currentSection } from "../lib/suggest";
import { CategoryPanelBody } from "./CategoryPanel";
import { ChatBar } from "./ChatBar";
import { DashSection } from "./DashSection";
import { JournalView } from "./JournalView";
import { Orb } from "./Orb";
import { ScheduleSetupButton } from "./ScheduleSetup";
import { TaskForm } from "./TaskForm";
import { WeeklyTaskForm, WeeklyTasksView } from "./WeeklyTasksView";
import { ActiveTasksPanel } from "./board/ActiveTasksPanel";
import { UpcomingDaysPanel } from "./board/DayBlocksPanel";
import { PrioritiesPanel } from "./board/PrioritiesPanel";
import { DropZone, TaskDndProvider, useActiveDrag } from "./board/TaskDnd";
import { TodaySchedulePanel } from "./board/TodaySchedulePanel";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning, Keenan";
  if (hour < 17) return "Good afternoon, Keenan";
  return "Good evening, Keenan";
}

function summarize(overdue: number, due: number, upcoming: number, done: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (due > 0) parts.push(`${due} due today`);
  if (upcoming > 0) parts.push(`${upcoming} this week`);
  if (parts.length === 0) parts.push("nothing on the schedule");
  const done_ = done > 0 ? ` ${done} done.` : "";
  const s = parts.join(", ") + "." + done_;
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  customize,
}: {
  taskStore: TaskStore;
  weeklyStore: WeeklyStore;
  categoryStore: CategoryStore;
  customize: boolean;
}) {
  const { tasks, loading } = taskStore;
  const { brief, loading: briefLoading, error, regenerate, saveManualOrder } = useBrief();
  const [editing, setEditing] = useState<Task | null>(null);
  const [addWeekly, setAddWeekly] = useState(false);
  const [addTaskCat, setAddTaskCat] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const today = edmontonToday(now);
  const nowSection = currentSection(now);
  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const sections = useMemo(() => computeSections(open, today), [open, today]);
  const doneToday = useMemo(() => doneTodayCount(tasks, today), [tasks, today]);

  const orderedTasks = useMemo(() => {
    const content = (brief?.content ?? null) as BriefContent | null;
    const base = brief?.manual_order ?? content?.suggested_order ?? [];
    return effectiveOrder(base, open, today);
  }, [brief, open, today]);

  const move = (index: number, dir: -1 | 1) => {
    const ids = orderedTasks.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void saveManualOrder(ids);
  };

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
  const edmontonHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", hour: "numeric", hour12: false }).format(now),
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
    categoryOf: (t: Task) => categoryStore.byId.get(t.category_id),
  };

  const dueToday = [...sections.overdue, ...sections.today];

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
        orderedIds: orderedTasks.map((t) => t.id),
        saveManualOrder,
        updateTask: taskStore.updateTask,
        setWeeklySection: (id, s) => weeklyStore.updateWeeklyTask(id, { time_section: s }),
        planWeeklyDay: (id, date) => weeklyStore.planDay(id, date),
        convertTaskToWeekly,
        convertWeeklyToTask,
      }}
    >
      <div className="min-h-dvh flex flex-col text-[13px]">
        {/* top bar — pr clears the fixed pencil in the corner */}
        <header className="flex items-center justify-between px-6 pr-20 py-2.5 gap-4 shrink-0">
          <span className={`text-[13px] ${sections.overdue.length > 0 ? "text-amber" : "text-dim"}`}>{status}</span>
          <div className="flex items-center gap-3">
            <ScheduleSetupButton />
            <div className="flex items-center gap-3 font-data text-[11px]">
              <span className="text-dim">{dateStr}</span>
              <span className="text-signal">{timeStr}</span>
            </div>
          </div>
        </header>

        {/* FIXED LAYOUT (BUILD_PLAN): rows 1–6, not user-rearrangeable */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          {/* Row 1 — Active Tasks | ORB | Today's Schedule, flanking at equal height */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)_minmax(0,1fr)] gap-3 items-stretch">
            <DashSection
              title="Active Tasks"
              customize={customize}
              bodyClassName="max-h-[320px]"
              className="lg:h-[340px]"
            >
              <ActiveTasksPanel
                section={nowSection}
                dueToday={dueToday}
                cardProps={cardProps}
                weeklyBits={weeklyStore}
              />
            </DashSection>

            {/* The orb sits between them, vertically centred — no panel chrome */}
            <div className="flex flex-col items-center justify-center lg:h-[340px]">
              <Orb size={230} />
              <p className="font-display text-[16px] font-medium tracking-wide text-hud -mt-2 text-center">
                {greeting(edmontonHour)}
              </p>
              <p className="text-[13px] text-dim mt-1 leading-snug text-center max-w-[360px]">
                {loading || briefLoading
                  ? "Pulling up your day…"
                  : summarize(sections.overdue.length, sections.today.length, sections.upcoming.length, doneToday)}
              </p>
              {error && <p className="text-amber text-xs mt-1">{error} — showing live data.</p>}
            </div>

            <DashSection
              title="Today's Schedule"
              customize={customize}
              hint={<span className="hud-chip">{dueToday.length}</span>}
              bodyClassName="max-h-[320px]"
              className="lg:h-[340px]"
            >
              <TodaySchedulePanel bare dueToday={dueToday} openTasks={open} cardProps={cardProps} weeklyBits={weeklyStore} />
            </DashSection>
          </div>

          {/* Row 2 — capture box, centred under the orb */}
          <div className="flex justify-center">
            <div className="w-full max-w-[560px]">
              <ChatBar
                onActionDone={async () => {
                  await Promise.all([taskStore.refresh(), categoryStore.refresh()]);
                }}
                inline
                taskTitleById={(id) => tasks.find((t) => t.id === id)?.title}
              />
            </div>
          </div>

          {/* Row 3 — Finance, centred directly under the capture box */}
          <div className="flex justify-center">
            <div className="w-full max-w-[560px]">
              <DashSection title="Finance" customize={customize} hint={<span className="hud-chip">soon</span>}>
                <p className="text-dim text-xs py-1">Balance and spending land here in Phase 6.</p>
              </DashSection>
            </div>
          </div>

          {/* Row 4 — Weekly Tasks (left) | Active Jobs → Upcoming Days → Journal (right, stacked) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <DropZone id="weekly">
              <DashSection
                title="Weekly Tasks"
                customize={customize}
                onAdd={() => setAddWeekly(true)}
                hint={<span className="hud-chip">{weeklyStore.weeklyTasks.length}</span>}
              >
                <WeeklyDropHint />
                <WeeklyTasksView {...weeklyStore} bare />
              </DashSection>
            </DropZone>

            <div className="flex flex-col gap-3">
              <DashSection title="Active Jobs" customize={customize} hint={<span className="hud-chip">soon</span>}>
                <p className="text-dim text-xs py-1">The jobs log lands here in Phase 3.</p>
              </DashSection>
              <DashSection title="Upcoming Days" customize={customize}>
                <UpcomingDaysPanel bare openTasks={open} today={today} onEdit={setEditing} />
              </DashSection>
              <DashSection title="Journal" customize={customize}>
                <JournalView compact />
              </DashSection>
            </div>
          </div>

          {/* Row 5 — Priorities, full width and deliberately thin */}
          <PrioritiesPanel
            orderedTasks={orderedTasks}
            today={today}
            onEdit={setEditing}
            onMove={move}
            manualOrder={brief?.manual_order !== null && brief?.manual_order !== undefined}
            categoryOf={cardProps.categoryOf}
            headerExtra={
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void regenerate();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void regenerate();
                  }
                }}
                className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
                aria-label="Regenerate brief"
              >
                {briefLoading ? "…" : generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
              </span>
            }
          />

          {/* Row 6 — the category panels, bottom of the page */}
          <div className="grid grid-cols-1 lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 items-start">
            {categoryStore.categories.map((cat) => (
              <DashSection
                key={cat.id}
                title={cat.name}
                customize={customize}
                onAdd={() => setAddTaskCat(cat.id)}
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
                <CategoryPanelBody category={cat} tasks={tasks} cardProps={cardProps} />
              </DashSection>
            ))}
          </div>
        </div>

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
        {addTaskCat && (
          <TaskForm
            categories={categoryStore.categories}
            defaults={{ category_id: addTaskCat }}
            onClose={() => setAddTaskCat(null)}
            onSubmit={async (input) => {
              await taskStore.addTask(input);
            }}
          />
        )}
      </div>
    </TaskDndProvider>
  );
}
