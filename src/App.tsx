import { useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { BriefView } from "./components/BriefView";
import { ChatBar } from "./components/ChatBar";
import { CustomizeToggle } from "./components/CustomizeToggle";
import { DesktopDashboard } from "./components/DesktopDashboard";
import { JobsView } from "./components/JobsView";
import { JournalView } from "./components/JournalView";
import { NAV_LABELS, Sidebar, type NavKey } from "./components/Sidebar";
import { TaskForm } from "./components/TaskForm";
import { TaskList } from "./components/TaskList";
import { WeeklyTasksView } from "./components/WeeklyTasksView";
import { useCategories } from "./hooks/useCategories";
import { useJobs } from "./hooks/useJobs";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTasks, type Task } from "./hooks/useTasks";
import { useWeeklyTasks } from "./hooks/useWeeklyTasks";

// Reserved nav slots (Finance, Groceries, Settings) — real features arrive in
// later phases; the sidebar entry exists per CLAUDE.md.
const PLACEHOLDER_COPY: Partial<Record<NavKey, string>> = {
  finance: "Finance arrives in Phase 6.",
  groceries: "Reserved — nothing here yet.",
  settings: "Settings arrive in a later phase.",
};

function Placeholder({ nav }: { nav: NavKey }) {
  return (
    <div className="hud-panel p-12 text-center mt-10 grid place-items-center min-h-[40vh]">
      <div>
        <p className="font-display text-signal text-lg tracking-[0.25em] uppercase mb-3">{NAV_LABELS[nav]}</p>
        <p className="text-dim text-base">{PLACEHOLDER_COPY[nav]}</p>
      </div>
    </div>
  );
}

function Shell() {
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  // The top-corner pencil: single ON/OFF customize-mode toggle (global)
  const [customize, setCustomize] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const taskStore = useTasks();
  const weeklyStore = useWeeklyTasks();
  const categoryStore = useCategories();
  const jobStore = useJobs();

  const dashboard = isDesktop ? (
    <DesktopDashboard
      taskStore={taskStore}
      weeklyStore={weeklyStore}
      categoryStore={categoryStore}
      jobStore={jobStore}
      onOpenJobs={() => setNav("jobs")}
      customize={customize}
      onToggleCustomize={() => setCustomize(!customize)}
    />
  ) : (
    <div className="px-4 py-4 pb-32 max-w-2xl w-full mx-auto">
      <BriefView
        tasks={taskStore.tasks}
        loading={taskStore.loading}
        completeTask={taskStore.completeTask}
        reopenTask={taskStore.reopenTask}
        updateTask={taskStore.updateTask}
        onEdit={setEditTask}
        categoryStore={categoryStore}
        weeklyStore={weeklyStore}
        customize={customize}
        refresh={taskStore.refresh}
      />
    </div>
  );

  const inner =
    nav === "dashboard" ? (
      dashboard
    ) : (
      <div className="px-6 lg:px-10 py-5 pb-32 w-full">
        {nav === "tasks" && (
          <TaskList {...taskStore} categoryStore={categoryStore} customize={customize} filterable />
        )}
        {nav === "weekly" && <WeeklyTasksView {...weeklyStore} customize={customize} />}
        {nav === "jobs" && <JobsView jobStore={jobStore} taskStore={taskStore} categoryStore={categoryStore} />}
        {nav === "journal" && <JournalView />}
        {(nav === "finance" || nav === "groceries" || nav === "settings") && <Placeholder nav={nav} />}
      </div>
    );

  return (
    <div className="lg:flex min-h-dvh">
      <Sidebar active={nav} onNavigate={setNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile top bar: hamburger + wordmark + customize pencil */}
        {!isDesktop && (
          <header className="sticky top-0 z-30 px-4 pt-[env(safe-area-inset-top)] bg-void/80 backdrop-blur-md">
            <div className="flex items-center justify-between py-2.5 border-b border-panel-border">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
                className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer focus-visible:outline-2 focus-visible:outline-signal rounded"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="font-display text-signal text-base tracking-[0.25em] text-glow">
                {nav === "dashboard" ? "OLIVE" : NAV_LABELS[nav].toUpperCase()}
              </h1>
              <CustomizeToggle on={customize} onToggle={() => setCustomize(!customize)} />
            </div>
          </header>
        )}

        <main className="flex-1 relative">
          {/* Desktop pencil for the non-dashboard tabs (which have no sticky header
              of their own). The Dashboard renders its own pencil inside its sticky
              header, so exclude it here to avoid a duplicate / one hidden behind it. */}
          {isDesktop && nav !== "dashboard" && (
            <div className="absolute top-4 right-10 z-30">
              <CustomizeToggle on={customize} onToggle={() => setCustomize(!customize)} />
            </div>
          )}
          {inner}
        </main>

        {/* quick capture stays global on mobile; desktop has it inline under the orb */}
        {!isDesktop && (
          <ChatBar
            onActionDone={async () => {
              await Promise.all([taskStore.refresh(), categoryStore.refresh(), jobStore.refresh()]);
            }}
            taskTitleById={(id) => taskStore.tasks.find((t) => t.id === id)?.title}
          />
        )}
      </div>

      {editTask && (
        <TaskForm
          initial={editTask}
          categories={categoryStore.categories}
          onClose={() => setEditTask(null)}
          onSubmit={async (input) => {
            await taskStore.updateTask(editTask.id, input);
          }}
          onDelete={async () => {
            await taskStore.deleteTask(editTask.id);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}
