import { useMemo } from "react";
import type { Task, TaskInput } from "../hooks/useTasks";
import { useBrief, type BriefContent } from "../hooks/useBrief";
import { daysBetween, edmontonToday } from "../lib/dates";
import { scoreTask } from "../lib/ranking";
import { TaskCard } from "./TaskCard";

type Props = {
  tasks: Task[];
  loading: boolean;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  onEdit: (task: Task) => void;
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

export function BriefView({ tasks, loading, completeTask, reopenTask, deleteTask, onEdit }: Props) {
  const { brief, loading: briefLoading, error, regenerate, saveManualOrder } = useBrief();
  const today = edmontonToday();

  const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const openById = useMemo(() => new Map(open.map((t) => [t.id, t])), [open]);

  // Sections computed live so mid-day additions/completions are always current
  const sections = useMemo(() => {
    const dated = (pred: (d: number) => boolean) =>
      open.filter((t) => t.due_date && pred(daysBetween(today, t.due_date)));
    return {
      overdue: dated((d) => d < 0),
      today: dated((d) => d === 0),
      upcoming: dated((d) => d > 0 && d <= 7),
    };
  }, [open, today]);

  const doneToday = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status === "completed" &&
          t.completed_at !== null &&
          edmontonToday(new Date(t.completed_at)) === today,
      ).length,
    [tasks, today],
  );

  // Effective order: manual wins, else the stored morning snapshot;
  // filter to still-open tasks, append anything new (created after generation) by score
  const orderedTasks = useMemo(() => {
    const content = (brief?.content ?? null) as BriefContent | null;
    const base = brief?.manual_order ?? content?.suggested_order ?? [];
    const seen = new Set<string>();
    const result: Task[] = [];
    for (const id of base) {
      const t = openById.get(id);
      if (t && !seen.has(id)) {
        result.push(t);
        seen.add(id);
      }
    }
    const rest = open
      .filter((t) => !seen.has(t.id))
      .sort((a, b) => scoreTask(b, today) - scoreTask(a, today) || a.created_at.localeCompare(b.created_at));
    return [...result, ...rest];
  }, [brief, open, openById, today]);

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

  return (
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
        <div className="hud-panel !border-amber/50 p-3 text-amber text-sm">
          {error} — showing live data instead.
        </div>
      )}

      <section className="hud-panel p-5">
        <RingGauge done={doneToday} total={doneToday + sections.today.length + sections.overdue.length} />
      </section>

      {(
        [
          { key: "overdue", label: "Overdue", items: sections.overdue, amber: true },
          { key: "today", label: "Today", items: sections.today, amber: false },
          { key: "upcoming", label: "Next 7 Days", items: sections.upcoming, amber: false },
        ] as const
      ).map(({ key, label, items, amber }) => (
        <section key={key} className={`hud-panel p-4 ${amber && items.length ? "!border-amber/40" : ""}`}>
          <header className="flex items-center justify-between mb-1">
            <h3
              className={`font-display text-xs tracking-[0.25em] uppercase ${
                amber && items.length ? "text-amber" : "text-signal"
              }`}
            >
              {label}
            </h3>
            <span className={`hud-chip ${amber && items.length ? "hud-chip-amber" : ""}`}>{items.length}</span>
          </header>
          {items.length === 0 ? (
            <p className="text-dim text-sm py-1.5">{key === "today" ? "Clear for today." : "Nothing."}</p>
          ) : (
            <div className="divide-y divide-signal-dim/15">
              {items.map((t) => (
                <TaskCard key={t.id} task={t} {...cardProps} />
              ))}
            </div>
          )}
        </section>
      ))}

      {orderedTasks.length > 0 && (
        <section className="hud-panel p-4">
          <header className="flex items-center justify-between mb-2">
            <h3 className="font-display text-xs tracking-[0.25em] uppercase text-signal">Suggested Order</h3>
            {brief?.manual_order && <span className="hud-chip">your order</span>}
          </header>
          <ol className="space-y-1">
            {orderedTasks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="font-data text-xs text-signal-dim w-5 text-right shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate font-body">{t.title}</span>
                <div className="flex shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${t.title} up`}
                    className="w-10 h-10 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === orderedTasks.length - 1}
                    aria-label={`Move ${t.title} down`}
                    className="w-10 h-10 grid place-items-center text-dim hover:text-signal disabled:opacity-25 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
