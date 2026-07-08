import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useHabits } from "../hooks/useHabits";
import { useTasks, type Task } from "../hooks/useTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { edmontonToday } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import { ChatBar } from "./ChatBar";
import { HabitsView } from "./HabitsView";
import { JournalView } from "./JournalView";
import { Orb } from "./Orb";
import { TaskForm } from "./TaskForm";
import { TaskList } from "./TaskList";
import { DayBlocksPanel } from "./board/DayBlocksPanel";
import { PrioritiesPanel } from "./board/PrioritiesPanel";
import { DropZone, TaskDndProvider, useActiveDragTask } from "./board/TaskDnd";
import { TodaySchedulePanel } from "./board/TodaySchedulePanel";

function Panel({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="hud-panel p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">{title}</h2>
        {hint}
      </header>
      {children}
    </section>
  );
}

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

// Habits panel body that glows as a drop target; drop converts task → daily habit
function HabitsDropHint() {
  const active = useActiveDragTask();
  if (!active) return null;
  return <p className="font-data text-[11px] text-signal/70 mb-2">drop to turn "{active.title}" into a daily habit</p>;
}

export function DesktopDashboard() {
  const taskStore = useTasks();
  const habitStore = useHabits();
  const { tasks, loading } = taskStore;
  const { brief, loading: briefLoading, error, regenerate, saveManualOrder } = useBrief();
  const [editing, setEditing] = useState<Task | null>(null);
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
    onDelete: taskStore.deleteTask,
  };

  const dueToday = [...sections.overdue, ...sections.today];

  return (
    <TaskDndProvider
      tasks={open}
      deps={{
        today,
        orderedIds: orderedTasks.map((t) => t.id),
        saveManualOrder,
        updateTask: taskStore.updateTask,
        convertToHabit: async (task) => {
          await habitStore.addHabit(task.title, "daily");
          await taskStore.deleteTask(task.id);
        },
      }}
    >
      <div className="min-h-dvh flex flex-col">
        {/* top bar */}
        <header className="flex items-center justify-between px-11 py-5">
          <div className="flex items-baseline gap-4">
            <h1 className="font-display font-semibold text-lg tracking-[0.25em] text-signal text-glow">OLIVE</h1>
            <span className={`text-[15px] ${sections.overdue.length > 0 ? "text-amber" : "text-dim"}`}>{status}</span>
          </div>
          <div className="flex items-center gap-5 font-data text-[13px]">
            <span className="text-dim">{dateStr}</span>
            <span className="text-signal">{timeStr}</span>
          </div>
        </header>

        {/* main: left | orb | right */}
        <div className="grid grid-cols-[1fr_460px_1fr] gap-7 px-11 items-start">
          {/* LEFT */}
          <div className="flex flex-col gap-6">
            <PrioritiesPanel
              orderedTasks={orderedTasks}
              today={today}
              onEdit={setEditing}
              onMove={move}
              manualOrder={brief?.manual_order !== null && brief?.manual_order !== undefined}
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

            <DropZone id="habits">
              <Panel title="Habits" hint={<span className="hud-chip">{habitStore.habits.length}</span>}>
                <HabitsDropHint />
                <HabitsView {...habitStore} bare />
              </Panel>
            </DropZone>
          </div>

          {/* CENTER: ORB */}
          <div className="flex flex-col items-center">
            <Orb size={420} />
            <div className="text-center -mt-3 max-w-[440px]">
              <p className="font-display text-[22px] font-medium tracking-wide text-hud">{greeting(edmontonHour)}</p>
              <p className="text-[17px] text-dim mt-2 leading-snug">
                {loading || briefLoading
                  ? "Pulling up your day…"
                  : summarize(sections.overdue.length, sections.today.length, sections.upcoming.length, doneToday)}
              </p>
              {error && <p className="text-amber text-sm mt-2">{error} — showing live data.</p>}
            </div>
            <div className="w-full max-w-[440px] mt-6">
              <ChatBar onActionDone={taskStore.refresh} inline />
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-6">
            <TodaySchedulePanel dueToday={dueToday} cardProps={cardProps} />
            <DayBlocksPanel openTasks={open} today={today} onEdit={setEditing} />
            <Panel title="Journal">
              <JournalView compact />
            </Panel>
          </div>
        </div>

        {/* BOTTOM: all tasks by category */}
        <div className="px-11 pt-7 pb-10">
          <TaskList {...taskStore} />
        </div>

        {editing && (
          <TaskForm
            initial={editing}
            onClose={() => setEditing(null)}
            onSubmit={async (input) => {
              await taskStore.updateTask(editing.id, input);
            }}
          />
        )}
      </div>
    </TaskDndProvider>
  );
}
