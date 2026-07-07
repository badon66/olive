import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useHabits } from "../hooks/useHabits";
import { useTasks, type Task } from "../hooks/useTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { edmontonToday, formatDue } from "../lib/dates";
import { computeSections, doneTodayCount, effectiveOrder } from "../lib/sections";
import { ChatBar } from "./ChatBar";
import { HabitsView } from "./HabitsView";
import { JournalView } from "./JournalView";
import { Orb } from "./Orb";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";
import { TaskList } from "./TaskList";

function Panel({ title, hint, amber = false, children }: { title: string; hint?: ReactNode; amber?: boolean; children: ReactNode }) {
  return (
    <section className={`hud-panel p-5 ${amber ? "!border-amber/40" : ""}`}>
      <header className="flex items-center justify-between mb-3">
        <h2 className={`font-display text-xs font-semibold tracking-[0.25em] uppercase ${amber ? "text-amber" : "text-signal"}`}>
          {title}
        </h2>
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

  return (
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
          <Panel
            title="Priorities"
            hint={
              <button
                onClick={() => void regenerate()}
                className="hud-chip hud-chip-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
                aria-label="Regenerate brief"
              >
                {briefLoading ? "…" : generatedAt ? `⟳ ${generatedAt}` : "⟳ generate"}
              </button>
            }
          >
            {orderedTasks.length === 0 ? (
              <p className="text-dim text-sm py-1.5">Nothing queued. Tell Olive or add a task below.</p>
            ) : (
              <ol>
                {orderedTasks.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 border-b border-signal-dim/15 last:border-b-0">
                    <span className="font-data text-xs text-signal/70 w-5 text-right shrink-0">{i + 1}</span>
                    <button
                      onClick={() => setEditing(t)}
                      className="flex-1 min-w-0 truncate text-left font-body font-medium text-[16px] cursor-pointer hover:text-signal transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-signal rounded"
                    >
                      {t.title}
                    </button>
                    {t.due_date && (
                      <span className={`hud-chip ${formatDue(t.due_date, today).includes("overdue") ? "hud-chip-amber" : ""}`}>
                        {formatDue(t.due_date, today)}
                      </span>
                    )}
                    <span className="flex shrink-0">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${t.title} up`}
                        className="w-8 h-8 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m18 15-6-6-6 6" />
                        </svg>
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === orderedTasks.length - 1}
                        aria-label={`Move ${t.title} down`}
                        className="w-8 h-8 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {brief?.manual_order && (
              <p className="mt-2 font-data text-[11px] text-dim">your order — held for today</p>
            )}
          </Panel>

          <Panel title="Overdue" amber={sections.overdue.length > 0} hint={<span className={`hud-chip ${sections.overdue.length ? "hud-chip-amber" : ""}`}>{sections.overdue.length}</span>}>
            {sections.overdue.length === 0 ? (
              <p className="text-dim text-sm py-1.5">Nothing overdue.</p>
            ) : (
              <div className="divide-y divide-signal-dim/15">
                {sections.overdue.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Habits" hint={<span className="hud-chip">{habitStore.habits.length}</span>}>
            <HabitsView {...habitStore} bare />
          </Panel>
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
          <Panel title="Today" hint={<span className="hud-chip">{`${doneToday}/${doneToday + sections.today.length + sections.overdue.length} done`}</span>}>
            {sections.today.length === 0 ? (
              <p className="text-dim text-sm py-1.5">Clear for today.</p>
            ) : (
              <div className="divide-y divide-signal-dim/15">
                {sections.today.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Next 7 Days" hint={<span className="hud-chip">{sections.upcoming.length}</span>}>
            {sections.upcoming.length === 0 ? (
              <p className="text-dim text-sm py-1.5">Nothing scheduled.</p>
            ) : (
              <div className="divide-y divide-signal-dim/15">
                {sections.upcoming.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            )}
          </Panel>

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
  );
}
