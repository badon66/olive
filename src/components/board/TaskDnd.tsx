import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Task } from "../../hooks/useTasks";
import type { WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { TimeSection } from "../../lib/sections";

// Draggable ids are "<zone>:<id>" so the same item can appear in several panels
// without collisions; payload data carries taskId OR weeklyId. Droppable ids:
// "section:<time_section>", "day:<YYYY-MM-DD>", "weekly", "cat:<categoryId>".

export type ActiveDrag = { kind: "task"; task: Task } | { kind: "weekly"; weekly: WeeklyTask };

export type DndDeps = {
  today: string;
  updateTask: (
    id: string,
    patch: { due_date?: string | null; time_section?: TimeSection | null },
  ) => Promise<void>;
  // Weekly task drops: into a schedule section, or onto a day block (plans just
  // that day — a `planned` checkin, not the recurring pattern)
  setWeeklySection?: (id: string, section: TimeSection | null) => Promise<void>;
  planWeeklyDay?: (id: string, date: string) => Promise<unknown>;
  // Two-way conversion (BUILD_PLAN): each returns an undo closure for the toast
  convertTaskToWeekly?: (task: Task) => Promise<() => Promise<void>>;
  convertWeeklyToTask?: (weekly: WeeklyTask, categoryId: string) => Promise<() => Promise<void>>;
};

const ActiveDragContext = createContext<ActiveDrag | null>(null);
export const useActiveDrag = () => useContext(ActiveDragContext);

// Pointer-precise across panels, rectangle fallback while sorting long lists
const collision: CollisionDetection = (args) => {
  const precise = pointerWithin(args);
  return precise.length > 0 ? precise : rectIntersection(args);
};

type UndoToast = { message: string; undo: () => Promise<void> };

export function TaskDndProvider({
  deps,
  tasks,
  weeklyTasks = [],
  children,
}: {
  deps: DndDeps;
  tasks: Task[];
  weeklyTasks?: WeeklyTask[];
  children: ReactNode;
}) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showUndo = (message: string, undo: () => Promise<void>) => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 7000);
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { taskId?: string; weeklyId?: string } | undefined;
    if (data?.taskId) {
      const task = tasks.find((t) => t.id === data.taskId);
      setActive(task ? { kind: "task", task } : null);
    } else if (data?.weeklyId) {
      const weekly = weeklyTasks.find((w) => w.id === data.weeklyId);
      setActive(weekly ? { kind: "weekly", weekly } : null);
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const item = active;
    setActive(null);
    const over = e.over?.id;
    if (!item || typeof over !== "string") return;

    if (item.kind === "weekly") {
      const w = item.weekly;
      if (over.startsWith("section:") && deps.setWeeklySection) {
        await deps.setWeeklySection(w.id, over.slice("section:".length) as TimeSection);
      } else if (over.startsWith("day:") && deps.planWeeklyDay) {
        // Plans only that specific day (a `planned` checkin) — never the pattern
        await deps.planWeeklyDay(w.id, over.slice("day:".length));
      } else if (over.startsWith("cat:") && deps.convertWeeklyToTask) {
        const undo = await deps.convertWeeklyToTask(w, over.slice("cat:".length));
        showUndo(`Converted "${w.name}" to a task — tap to undo`, undo);
      } else if (over === "weekly" && deps.setWeeklySection) {
        await deps.setWeeklySection(w.id, null); // back home = unschedule from day parts
      }
      return;
    }

    const task = item.task;
    if (over.startsWith("section:")) {
      const section = over.slice("section:".length) as TimeSection;
      await deps.updateTask(task.id, { due_date: deps.today, time_section: section });
    } else if (over.startsWith("day:")) {
      // Booking times survive a date move — only due_date changes
      await deps.updateTask(task.id, { due_date: over.slice("day:".length) });
    } else if (over === "weekly" && deps.convertTaskToWeekly) {
      const undo = await deps.convertTaskToWeekly(task);
      showUndo(`Converted "${task.title}" to a weekly task — tap to undo`, undo);
    }
  };

  const overlayLabel = active?.kind === "task" ? active.task.title : active?.weekly.name;

  return (
    <ActiveDragContext.Provider value={active}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        {children}
        <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
          {active && (
            <div className="hud-panel px-3 py-2 font-body font-semibold text-sm text-signal shadow-[0_0_20px_rgba(63,169,104,0.35)] cursor-grabbing">
              {active.kind === "weekly" && <span className="font-data text-[10px] text-dim mr-2">WEEKLY</span>}
              {overlayLabel}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Undo toast: conversions are fast but never silently unrecoverable */}
      {toast && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <button
            onClick={async () => {
              window.clearTimeout(toastTimer.current);
              const t = toast;
              setToast(null);
              await t.undo();
            }}
            className="pointer-events-auto hud-panel !border-signal/50 px-4 py-2.5 font-body text-sm text-hud shadow-[0_0_24px_rgba(63,169,104,0.3)] cursor-pointer hover:!border-signal"
          >
            {toast.message}
          </button>
        </div>
      )}
    </ActiveDragContext.Provider>
  );
}

// Whole-row draggable wrapper. The 6px activation distance keeps inner buttons
// (complete/edit/delete) clickable — a click never travels far enough to drag.
function DraggableRow({
  id,
  data,
  children,
  className = "",
}: {
  id: string;
  data: { taskId?: string; weeklyId?: string };
  children: ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  const style: CSSProperties = isDragging ? { opacity: 0.35 } : {};
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-manipulation cursor-grab active:cursor-grabbing ${className}`}
    >
      {children}
    </div>
  );
}

export function DraggableTask({
  zone,
  task,
  children,
  className = "",
}: {
  zone: string;
  task: Task;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DraggableRow id={`${zone}:${task.id}`} data={{ taskId: task.id }} className={className}>
      {children}
    </DraggableRow>
  );
}

export function DraggableWeekly({
  zone,
  weekly,
  children,
  className = "",
}: {
  zone: string;
  weekly: WeeklyTask;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DraggableRow id={`${zone}:${weekly.id}`} data={{ weeklyId: weekly.id }} className={className}>
      {children}
    </DraggableRow>
  );
}

// Droppable container with the HUD hover glow
export function DropZone({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`transition duration-200 rounded ${
        isOver ? "bg-signal/5 shadow-[inset_0_0_0_1px_#3FA968,0_0_14px_rgba(63,169,104,0.25)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
