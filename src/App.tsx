import { useState } from "react";
import { AddMenu, type AddKind } from "./components/AddMenu";
import { AuthGate } from "./components/AuthGate";
import { BriefView } from "./components/BriefView";
import { ChatBar } from "./components/ChatBar";
import { DesktopDashboard } from "./components/DesktopDashboard";
import { JournalView } from "./components/JournalView";
import { NAV_LABELS, Sidebar, type NavKey } from "./components/Sidebar";
import { CategoryForm, TaskList } from "./components/TaskList";
import { TaskForm } from "./components/TaskForm";
import { WeeklyTaskForm, WeeklyTasksView } from "./components/WeeklyTasksView";
import { useCategories } from "./hooks/useCategories";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTasks, type Task } from "./hooks/useTasks";
import { useWeeklyTasks } from "./hooks/useWeeklyTasks";

// Reserved nav slots (Active Jobs, Finance, Groceries, Settings) — real
// features arrive in later phases; the sidebar entry exists per CLAUDE.md.
const PLACEHOLDER_COPY: Partial<Record<NavKey, string>> = {
  jobs: "Active Jobs arrives in Phase 3.",
  finance: "Finance arrives in Phase 6.",
  groceries: "Reserved — nothing here yet.",
  settings: "Settings arrive in a later phase.",
};

function Placeholder({ nav }: { nav: NavKey }) {
  return (
    <div className="hud-panel p-8 text-center max-w-md mx-auto mt-12">
      <p className="font-display text-signal text-sm tracking-[0.25em] uppercase mb-2">{NAV_LABELS[nav]}</p>
      <p className="text-dim">{PLACEHOLDER_COPY[nav]}</p>
    </div>
  );
}

function Shell() {
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const taskStore = useTasks();
  const weeklyStore = useWeeklyTasks();
  const categoryStore = useCategories();

  const dashboard = isDesktop ? (
    <DesktopDashboard taskStore={taskStore} weeklyStore={weeklyStore} categoryStore={categoryStore} />
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
      />
    </div>
  );

  const inner =
    nav === "dashboard" ? (
      dashboard
    ) : (
      <div className={`px-4 lg:px-10 py-5 pb-32 w-full ${nav === "journal" ? "max-w-3xl" : "max-w-5xl"}`}>
        {nav === "tasks" && <TaskList {...taskStore} categoryStore={categoryStore} />}
        {nav === "weekly" && <WeeklyTasksView {...weeklyStore} />}
        {nav === "journal" && <JournalView />}
        {(nav === "jobs" || nav === "finance" || nav === "groceries" || nav === "settings") && (
          <Placeholder nav={nav} />
        )}
      </div>
    );

  return (
    <div className="lg:flex min-h-dvh">
      <Sidebar active={nav} onNavigate={setNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile top bar: hamburger + wordmark (sidebar is the only nav) */}
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
              <AddMenu onSelect={setAddKind} />
            </div>
          </header>
        )}

        <main className="flex-1 relative">
          {/* ONE pencil, top corner of the main content (desktop) — opens the add-new menu */}
          {isDesktop && (
            <div className="absolute top-4 right-10 z-30">
              <AddMenu onSelect={setAddKind} />
            </div>
          )}
          {inner}
        </main>

        {/* quick capture stays global on mobile; desktop has it inline under the orb */}
        {!isDesktop && (
          <ChatBar
            onActionDone={async () => {
              await Promise.all([taskStore.refresh(), categoryStore.refresh()]);
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

      {/* Add-new modals, launched from the pencil menu */}
      {addKind === "task" && (
        <TaskForm
          categories={categoryStore.categories}
          onClose={() => setAddKind(null)}
          onSubmit={async (input) => {
            await taskStore.addTask(input);
          }}
        />
      )}
      {addKind === "weekly" && (
        <WeeklyTaskForm
          onClose={() => setAddKind(null)}
          onSubmit={async (input) => {
            await weeklyStore.addWeeklyTask(input);
          }}
        />
      )}
      {addKind === "category" && (
        <CategoryForm
          onClose={() => setAddKind(null)}
          onSubmit={async (name, color) => {
            await categoryStore.addCategory(name, color);
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
