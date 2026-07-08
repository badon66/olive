import { useMemo } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { edmontonToday } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import type { HabitStore } from "../hooks/useHabits";
import { UpcomingDaysPanel } from "./board/DayBlocksPanel";
import { PrioritiesPanel } from "./board/PrioritiesPanel";
import { TaskDndProvider } from "./board/TaskDnd";
import { TodaySchedulePanel } from "./board/TodaySchedulePanel";

type Props = {
  tasks: Task[];
  loading: boolean;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  onEdit: (task: Task) => void;
  streaks?: { name: string; label: string }[];
  habitStore?: HabitStore;
};

function RingGauge({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <div className="relative w-36 h-36 mx-auto" role="img" aria-label={`${done} of ${total} tasks done today`}>
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(46,255,181,0.12)" strokeWidth="8" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="#2EFFB5"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ filter: "drop-shadow(0 0 6px rgba(46,255,181,0.5))", transition: "stroke-dashoffset 400ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center -mt-1">
        <div className="text-center">
          <p className="font-display text-3xl text-signal text-glow leading-none">
            {done}
            <span className="text-dim text-lg">/{total}</span>
          </p>
          <p className="font-data text-[0.6rem] text-dim tracking-widest mt-1">TODAY</p>
        </div>
      </div>
    </div>
  );
}

export function BriefView({ tasks, loading, completeTask, reopenTask, deleteTask, updateTask, onEdit, streaks = [], habitStore }: Props) {
  const { brief, loading: briefLoading, error, regenerate, saveManualOrder } = useBrief();
  const today = edmontonToday();

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

  const cardProps = {
    today,
    onComplete: completeTask,
    onReopen: reopenTask,
    onEdit,
    onDelete: deleteTask,
  };

  if (loading || briefLoading) return <p className="text-dim pulse-live">Building your brief…</p>;

  const generatedAt = brief
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Edmonton",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(brief.generated_at))
    : null;

  const dueToday = [...sections.overdue, ...sections.today];

  return (
    <TaskDndProvider
      tasks={open}
      habits={habitStore?.habits}
      deps={{
        today,
        orderedIds: orderedTasks.map((t) => t.id),
        saveManualOrder,
        updateTask,
        updateHabit: habitStore ? (id, patch) => habitStore.updateHabit(id, patch) : undefined,
      }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm tracking-[0.25em] uppercase text-hud">Daily Brief</h2>
          <button
            onClick={() => void regenerate()}
            className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
            aria-label="Regenerate brief"
          >
            {generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
          </button>
        </div>

        {error && (
          <div className="hud-panel !border-amber/50 p-3 text-amber text-sm">{error} — showing live data instead.</div>
        )}

        <section className="hud-panel p-5">
          <RingGauge done={doneToday} total={doneToday + sections.today.length + sections.overdue.length} />
        </section>

        {streaks.length > 0 && (
          <section className="hud-panel p-4">
            <h3 className="font-display text-xs tracking-[0.25em] uppercase text-signal mb-2">Streaks</h3>
            <div className="flex flex-wrap gap-1.5">
              {streaks.map((s) => (
                <span key={s.name} className={`hud-chip ${s.label.startsWith("0") ? "" : "hud-chip-signal"}`}>
                  {s.name} ▮ {s.label}
                </span>
              ))}
            </div>
          </section>
        )}

        <PrioritiesPanel
          orderedTasks={orderedTasks}
          today={today}
          onEdit={onEdit}
          onMove={move}
          manualOrder={brief?.manual_order !== null && brief?.manual_order !== undefined}
        />

        <TodaySchedulePanel dueToday={dueToday} cardProps={cardProps} habitBits={habitStore} />

        <UpcomingDaysPanel openTasks={open} today={today} onEdit={onEdit} />
      </div>
    </TaskDndProvider>
  );
}
