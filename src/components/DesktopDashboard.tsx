import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { type LayoutItem } from "react-grid-layout";
import { supabase } from "../lib/supabase";
import type { CategoryStore } from "../hooks/useCategories";
import type { Task, TaskStore } from "../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../hooks/useWeeklyTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { DEFAULT_LABELS, catKey } from "../lib/dashboardLayout";
import { edmontonToday } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import { CategoryPanelBody } from "./CategoryPanel";
import { ChatBar } from "./ChatBar";
import { DashSection } from "./DashSection";
import { JournalView } from "./JournalView";
import { Orb } from "./Orb";
import { ScheduleSetupButton } from "./ScheduleSetup";
import { TaskForm } from "./TaskForm";
import { WeeklyTaskForm, WeeklyTasksView } from "./WeeklyTasksView";
import { UpcomingDaysPanel } from "./board/DayBlocksPanel";
import { PrioritiesPanel } from "./board/PrioritiesPanel";
import { DropZone, TaskDndProvider, useActiveDrag } from "./board/TaskDnd";
import { TodaySchedulePanel } from "./board/TodaySchedulePanel";

// react-grid-layout geometry: small rows + measured content heights so every
// section is exactly as tall as what's inside it.
const GRID_COLS = 12;
const ROW_H = 10;
const MARGIN = 20;
const pxToUnits = (px: number) => Math.max(4, Math.ceil((px + MARGIN) / (ROW_H + MARGIN)));

function greeting(hour: number): string {
  if (hour < 12) return "Good morning, Keenan";
  if (hour < 17) return "Good afternoon, Keenan";
  return "Good evening, Keenan";
}

function summarize(overdue: number, due: number, upcoming: number, done: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue need${overdue === 1 ? "s" : ""} attention`);
  if (due > 0) parts.push(`${due} due today`);
  if (upcoming > 0) parts.push(`${upcoming} coming up this week`);
  if (parts.length === 0) parts.push("nothing on the schedule");
  const done_ = done > 0 ? ` ${done} already done today.` : "";
  const s = parts.join(", ") + "." + done_;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Weekly panel hint while dragging: task → converts (with undo), weekly → unschedules
function WeeklyDropHint() {
  const active = useActiveDrag();
  if (!active) return null;
  return (
    <p className="font-data text-[11px] text-signal/70 mb-2">
      {active.kind === "task"
        ? `drop to turn "${active.task.title}" into a weekly task`
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

  // ---- customize-mode layout: persisted per-user, heights measured live ----
  const categoryIds = useMemo(() => categoryStore.categories.map((c) => c.id), [categoryStore.categories]);
  const { layout: savedLayout, loaded: layoutLoaded, savePositions, saveLabel } = useDashboardLayout(categoryIds);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const onMeasure = useCallback((key: string, px: number) => {
    setHeights((prev) => (Math.abs((prev[key] ?? 0) - px) < 4 ? prev : { ...prev, [key]: px }));
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1200);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridWidth(el.offsetWidth));
    ro.observe(el);
    setGridWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const sectionKeys = useMemo(
    () => ["weekly", ...categoryIds.map(catKey), "finance", "schedule", "upcoming", "jobs", "journal", "priorities"],
    [categoryIds],
  );

  const labelFor = (key: string): string => {
    const custom = savedLayout[key]?.label;
    if (custom) return custom;
    if (key.startsWith("cat:")) return categoryStore.byId.get(key.slice(4))?.name ?? "Category";
    return DEFAULT_LABELS[key] ?? key;
  };

  const rglLayout: LayoutItem[] = sectionKeys.map((key) => {
    const pos = savedLayout[key] ?? { x: 0, y: 999, w: 6 };
    return {
      i: key,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pxToUnits(heights[key] ?? 120),
      minW: 3,
      maxW: GRID_COLS,
      resizeHandles: ["e", "w"] as const,
    };
  });

  const onLayoutCommit = (l: readonly LayoutItem[]) =>
    savePositions(l.map((it) => ({ key: it.i, x: it.x, y: it.y, w: it.w })));

  // ---- clock / status ----
  const edmontonHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", hour: "numeric", hour12: false }).format(now),
  );
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

  const status =
    sections.overdue.length > 0
      ? `${sections.overdue.length} overdue item${sections.overdue.length === 1 ? "" : "s"} need${sections.overdue.length === 1 ? "s" : ""} attention`
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

  // Two-way task ↔ weekly conversion, each returning an undo closure (BUILD_PLAN)
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
      await supabase.from("tasks").insert(task); // same id, original fields
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
    await supabase.from("weekly_tasks").delete().eq("id", weekly.id); // checkins cascade
    await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    return async () => {
      await supabase.from("tasks").delete().eq("id", created.id);
      await supabase.from("weekly_tasks").insert(weekly); // same id restores links
      if (history?.length) await supabase.from("weekly_task_checkins").insert(history);
      await Promise.all([taskStore.refresh(), weeklyStore.refresh()]);
    };
  };

  const sectionContent = (key: string) => {
    if (key === "weekly") {
      return (
        <DropZone id="weekly">
          <WeeklyDropHint />
          <WeeklyTasksView {...weeklyStore} bare draggable />
        </DropZone>
      );
    }
    if (key.startsWith("cat:")) {
      const cat = categoryStore.byId.get(key.slice(4));
      if (!cat) return null;
      return <CategoryPanelBody category={cat} tasks={tasks} cardProps={cardProps} />;
    }
    if (key === "finance") return <p className="text-dim text-sm py-1.5">Balance and spending land here in Phase 6.</p>;
    if (key === "jobs") return <p className="text-dim text-sm py-1.5">The jobs log lands here in Phase 3.</p>;
    if (key === "schedule") return <TodaySchedulePanel bare dueToday={dueToday} cardProps={cardProps} weeklyBits={weeklyStore} />;
    if (key === "upcoming") return <UpcomingDaysPanel bare openTasks={open} today={today} onEdit={setEditing} />;
    if (key === "journal") return <JournalView compact />;
    if (key === "priorities") {
      return (
        <PrioritiesPanel
          bare
          orderedTasks={orderedTasks}
          today={today}
          onEdit={setEditing}
          onMove={move}
          manualOrder={brief?.manual_order !== null && brief?.manual_order !== undefined}
          categoryOf={cardProps.categoryOf}
        />
      );
    }
    return null;
  };

  const hintFor = (key: string) => {
    if (key === "weekly") return <span className="hud-chip">{weeklyStore.weeklyTasks.length}</span>;
    if (key === "schedule") return <span className="hud-chip">{dueToday.length}</span>;
    if (key === "priorities") {
      return (
        <span
          role="button"
          tabIndex={0}
          onClick={() => void regenerate()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") void regenerate();
          }}
          className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
          aria-label="Regenerate brief"
        >
          {briefLoading ? "…" : generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
        </span>
      );
    }
    if (key.startsWith("cat:")) {
      const cat = categoryStore.byId.get(key.slice(4));
      const count = cat ? open.filter((t) => t.category_id === cat.id).length : 0;
      return (
        <span className="flex items-center gap-1.5">
          {cat && (
            <span className="w-2 h-2 rounded-full" style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}` }} aria-hidden="true" />
          )}
          <span className="hud-chip">{count}</span>
        </span>
      );
    }
    return undefined;
  };

  const onAddFor = (key: string) => {
    if (key === "weekly") return () => setAddWeekly(true);
    if (key.startsWith("cat:")) return () => setAddTaskCat(key.slice(4));
    return undefined; // spec: "+" lives on Weekly Tasks and category panels
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
      <div className="min-h-dvh flex flex-col">
        {/* top bar — wordmark lives in the sidebar; pr clears the global pencil */}
        <header className="flex items-center justify-between px-10 pr-24 py-5 gap-4">
          <span className={`text-[15px] ${sections.overdue.length > 0 ? "text-amber" : "text-dim"}`}>{status}</span>
          <div className="flex items-center gap-4">
            <ScheduleSetupButton />
            <div className="flex items-center gap-5 font-data text-[13px]">
              <span className="text-dim">{dateStr}</span>
              <span className="text-signal">{timeStr}</span>
            </div>
          </div>
        </header>

        {/* HERO: orb + greeting + capture bar — fixed in place; sections
            rearrange around it, never over it */}
        <div className="flex flex-col items-center px-10">
          <Orb size={380} />
          <div className="text-center -mt-3 max-w-[520px]">
            <p className="font-display text-[22px] font-medium tracking-wide text-hud">{greeting(edmontonHour)}</p>
            <p className="text-[17px] text-dim mt-2 leading-snug">
              {loading || briefLoading
                ? "Pulling up your day…"
                : summarize(sections.overdue.length, sections.today.length, sections.upcoming.length, doneToday)}
            </p>
            {error && <p className="text-amber text-sm mt-2">{error} — showing live data.</p>}
          </div>
          <div className="w-full max-w-[560px] mt-5">
            <ChatBar
              onActionDone={async () => {
                await Promise.all([taskStore.refresh(), categoryStore.refresh()]);
              }}
              inline
              taskTitleById={(id) => tasks.find((t) => t.id === id)?.title}
            />
          </div>
        </div>

        {/* CUSTOMIZABLE GRID: default = the two-column split; customize mode
            makes every section drag-repositionable + horizontally resizable,
            persisted per-user in dashboard_layouts */}
        <div ref={gridRef} className="px-10 pt-5 pb-10">
          {layoutLoaded && (
            <GridLayout
              width={gridWidth - 0}
              layout={rglLayout}
              gridConfig={{ cols: GRID_COLS, rowHeight: ROW_H, margin: [MARGIN, MARGIN], containerPadding: [0, 0] }}
              dragConfig={{
                enabled: customize,
                // Keep buttons/fields/dnd-kit item rows interactive while ON —
                // .touch-manipulation is the DraggableRow marker class
                cancel: "button, input, textarea, select, a, .touch-manipulation",
                threshold: 6,
              }}
              resizeConfig={{ enabled: customize, handles: ["e", "w"] }}
              onDragStop={(l: readonly LayoutItem[]) => onLayoutCommit(l)}
              onResizeStop={(l: readonly LayoutItem[]) => onLayoutCommit(l)}
            >
              {sectionKeys.map((key) => (
                <div key={key}>
                  <DashSection
                    sectionKey={key}
                    title={labelFor(key)}
                    customize={customize}
                    onRename={(label) =>
                      saveLabel(
                        key,
                        label,
                        key.startsWith("cat:")
                          ? categoryStore.byId.get(key.slice(4))?.name ?? ""
                          : DEFAULT_LABELS[key] ?? "",
                      )
                    }
                    onAdd={onAddFor(key)}
                    hint={hintFor(key)}
                    onMeasure={onMeasure}
                  >
                    {sectionContent(key)}
                  </DashSection>
                </div>
              ))}
            </GridLayout>
          )}
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
