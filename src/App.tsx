import { useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { BriefView } from "./components/BriefView";
import { ChatBar } from "./components/ChatBar";
import { DesktopDashboard } from "./components/DesktopDashboard";
import { TaskForm } from "./components/TaskForm";
import { TaskList } from "./components/TaskList";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTasks, type Task } from "./hooks/useTasks";
import { edmontonToday } from "./lib/dates";

type View = "brief" | "tasks";

const NAV: { view: View; label: string; icon: string }[] = [
  // 24x24 stroke paths (Lucide-style): layout-list for brief, check-circle for tasks
  { view: "brief", label: "Brief", icon: "M3 3h7v7H3zM14 4h7M14 9h7M3 14h7v7H3zM14 15h7M14 20h7" },
  { view: "tasks", label: "Tasks", icon: "M22 11.1V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" },
];

function MobileShell() {
  const [view, setView] = useState<View>("brief");
  const [briefEdit, setBriefEdit] = useState<Task | null>(null);
  const taskStore = useTasks();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-baseline justify-between py-3 border-b border-signal-dim/25 backdrop-blur-md">
          <h1 className="font-display text-signal text-lg tracking-[0.3em] text-glow">OLIVE</h1>
          <span className="font-data text-xs text-dim">{edmontonToday()}</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-44 max-w-2xl w-full mx-auto">
        {view === "brief" ? (
          <BriefView
            tasks={taskStore.tasks}
            loading={taskStore.loading}
            completeTask={taskStore.completeTask}
            reopenTask={taskStore.reopenTask}
            deleteTask={taskStore.deleteTask}
            updateTask={taskStore.updateTask}
            onEdit={setBriefEdit}
          />
        ) : (
          <TaskList {...taskStore} />
        )}
      </main>

      {briefEdit && (
        <TaskForm
          initial={briefEdit}
          onClose={() => setBriefEdit(null)}
          onSubmit={async (input) => {
            await taskStore.updateTask(briefEdit.id, input);
          }}
        />
      )}

      <ChatBar onActionDone={taskStore.refresh} />

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-void/80 backdrop-blur-md border-t border-signal-dim/25 pb-[env(safe-area-inset-bottom)]">
        <div className="flex max-w-2xl mx-auto">
          {NAV.map(({ view: v, label, icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-current={view === v ? "page" : undefined}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 min-h-[52px] font-display text-[0.65rem] tracking-[0.2em] uppercase transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-signal ${
                view === v ? "text-signal" : "text-dim"
              }`}
            >
              {view === v && (
                <span className="absolute top-0 inset-x-6 h-px bg-signal shadow-[0_0_8px_#2EFFB5]" />
              )}
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  return <AuthGate>{isDesktop ? <DesktopDashboard /> : <MobileShell />}</AuthGate>;
}
