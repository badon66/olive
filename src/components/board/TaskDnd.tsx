import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
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
import { arrayMove } from "@dnd-kit/sortable";
import type { Task } from "../../hooks/useTasks";
import type { TimeSection } from "../../lib/sections";

// Draggable ids are "<zone>:<taskId>" so the same task can appear in several
// panels (priorities + schedule) without id collisions. Droppable ids:
// "section:<time_section>", "day:<YYYY-MM-DD>", "habits", "prio:<taskId>".

export type DndDeps = {
  today: string;
  orderedIds: string[];
  saveManualOrder: (ids: string[]) => void | Promise<void>;
  updateTask: (
    id: string,
    patch: { due_date?: string | null; time_section?: TimeSection | null },
  ) => Promise<void>;
  // Desktop only: dropping a task on Habits converts it into a daily habit
  convertToHabit?: (task: Task) => Promise<void>;
};

const ActiveTaskContext = createContext<Task | null>(null);
export const useActiveDragTask = () => useContext(ActiveTaskContext);

// Pointer-precise across panels, rectangle fallback while sorting long lists
const collision: CollisionDetection = (args) => {
  const precise = pointerWithin(args);
  return precise.length > 0 ? precise : rectIntersection(args);
};

export function TaskDndProvider({ deps, tasks, children }: { deps: DndDeps; tasks: Task[]; children: ReactNode }) {
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const taskId = (e.active.data.current as { taskId?: string } | undefined)?.taskId;
    setActive(tasks.find((t) => t.id === taskId) ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const task = active;
    setActive(null);
    const over = e.over?.id;
    if (!task || typeof over !== "string") return;

    if (over.startsWith("section:")) {
      const section = over.slice("section:".length) as TimeSection;
      await deps.updateTask(task.id, { due_date: deps.today, time_section: section });
    } else if (over.startsWith("day:")) {
      await deps.updateTask(task.id, { due_date: over.slice("day:".length) });
    } else if (over === "habits" && deps.convertToHabit) {
      await deps.convertToHabit(task);
    } else if (over.startsWith("prio:")) {
      // Reorder within priorities: move task to the position of the row it was dropped on
      const overId = over.slice("prio:".length);
      if (overId === task.id) return;
      const ids = deps.orderedIds.includes(task.id) ? [...deps.orderedIds] : [...deps.orderedIds, task.id];
      const from = ids.indexOf(task.id);
      const to = ids.indexOf(overId);
      if (from === -1 || to === -1) return;
      await deps.saveManualOrder(arrayMove(ids, from, to));
    }
  };

  return (
    <ActiveTaskContext.Provider value={active}>
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
            <div className="hud-panel px-3 py-2 font-body font-semibold text-sm text-signal shadow-[0_0_20px_rgba(46,255,181,0.35)] cursor-grabbing">
              {active.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </ActiveTaskContext.Provider>
  );
}

// Whole-row draggable wrapper. The 6px activation distance keeps inner buttons
// (complete/edit/delete) clickable — a click never travels far enough to drag.
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${zone}:${task.id}`,
    data: { taskId: task.id },
  });
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
      className={`transition-all duration-200 rounded ${
        isOver ? "bg-signal/5 shadow-[inset_0_0_0_1px_#2EFFB5,0_0_14px_rgba(46,255,181,0.25)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
