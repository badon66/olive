import { useMemo, useState } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import type { CategoryStore } from "../hooks/useCategories";
import type { WeeklyStore } from "../hooks/useWeeklyTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { edmontonToday } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import { ScheduleSetupButton } from "./ScheduleSetup";
import { WeeklyTaskForm, WeeklyTasksView } from "./WeeklyTasksView";
import { UpcomingDaysPanel } from "./board/DayBlocksPanel";
import { PrioritiesPanel } from "./board/PrioritiesPanel";
import { TaskDndProvider } from "./board/TaskDnd";
import { TodaySchedulePanel } from "./board/TodaySchedulePanel";

type Props = {
  tasks: Task[];
  loading: boolean;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  onEdit: (task: Task) => void;
  categoryStore: CategoryStore;
  weeklyStore?: WeeklyStore;
  customize?: boolean;
};

function RingGauge({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <div className="relative w-36 h-36 mx-auto" role="img" aria-label={`${done} of ${total} tasks done today`}>
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(63,169,104,0.12)" strokeWidth="8" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="#3FA968"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ filter: "drop-shadow(0 0 6px rgba(63,169,104,0.5))", transition: "stroke-dashoffset 400ms ease-out" }}
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

export function BriefView({ tasks, loading, completeTask, reopenTask, updateTask, onEdit, categoryStore, weeklyStore, customize = false }: Props) {
  const { brief, loading: briefLoading, error, regenerate, saveManualOrder } = useBrief();
  const [addWeekly, setAddWeekly] = useState(false);
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
    categoryOf: (t: Task) => categoryStore.byId.get(t.category_id),
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
      weeklyTasks={weeklyStore?.weeklyTasks}
      deps={{
        today,
        orderedIds: orderedTasks.map((t) => t.id),
        saveManualOrder,
        updateTask,
        setWeeklySection: weeklyStore ? (id, s) => weeklyStore.updateWeeklyTask(id, { time_section: s }) : undefined,
        planWeeklyDay: weeklyStore ? (id, date) => weeklyStore.planDay(id, date) : undefined,
      }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-sm tracking-[0.25em] uppercase text-hud">Daily Brief</h2>
          <span className="flex items-center gap-2">
            <ScheduleSetupButton />
            <button
              onClick={() => void regenerate()}
              className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
              aria-label="Regenerate brief"
            >
              {generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
            </button>
          </span>
        </div>

        {error && (
          <div className="hud-panel !border-amber/50 p-3 text-amber text-sm">{error} — showing live data instead.</div>
        )}

        <section className="hud-panel p-5">
          <RingGauge done={doneToday} total={doneToday + sections.today.length + sections.overdue.length} />
        </section>

        {/* Section order per BUILD_PLAN: Weekly Tasks first, Priorities demoted to the bottom */}
        {weeklyStore && (
          <section className="hud-panel p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal">
                Weekly Tasks
              </h3>
              {customize && (
                <button
                  onClick={() => setAddWeekly(true)}
                  aria-label="Add weekly task"
                  className="w-8 h-8 grid place-items-center rounded border border-signal/50 text-signal cursor-pointer hover:bg-signal/15 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
            <WeeklyTasksView {...weeklyStore} bare />
          </section>
        )}

        {addWeekly && weeklyStore && (
          <WeeklyTaskForm
            onClose={() => setAddWeekly(false)}
            onSubmit={async (input) => {
              await weeklyStore.addWeeklyTask(input);
            }}
          />
        )}

        <TodaySchedulePanel dueToday={dueToday} cardProps={cardProps} weeklyBits={weeklyStore} />

        <UpcomingDaysPanel openTasks={open} today={today} onEdit={onEdit} />

        <PrioritiesPanel
          orderedTasks={orderedTasks}
          today={today}
          onEdit={onEdit}
          onMove={move}
          manualOrder={brief?.manual_order !== null && brief?.manual_order !== undefined}
        />
      </div>
    </TaskDndProvider>
  );
}
