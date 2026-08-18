import type { CategoryRow } from "../hooks/useCategories";
import type { Task } from "../hooks/useTasks";
import { orderBySortOrder } from "../lib/sections";
import { TaskCard } from "./TaskCard";
import { DraggableTask, DropZone } from "./board/TaskDnd";

type CardProps = {
  today: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onTripleClick?: (task: Task) => void;
};

// One category's tasks — the dashboard's per-category section content
// (DashSection provides the chrome; the colored edge comes from the category).
export function CategoryPanelBody({
  category,
  tasks,
  cardProps,
}: {
  category: CategoryRow;
  tasks: Task[];
  cardProps: CardProps;
}) {
  const mine = tasks.filter((t) => t.category_id === category.id);
  // No reorder arrows here (BUILD_PLAN): arrows live ONLY in Active Tasks and
  // Today's Schedule. Ordering still respects any sort_order set from there.
  const group = orderBySortOrder(mine.filter((t) => t.status === "open"));
  // Completed work doesn't vanish — the 5 most recent stay visible at the bottom
  // of the category that owns them (BUILD_PLAN). Newest first; rows with no
  // timestamp sort last rather than jumping to the top.
  const done = mine
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5);

  return (
    <DropZone id={`cat:${category.id}`}>
      <div className="border-l-[3px] pl-3 -ml-1" style={{ borderColor: category.color }}>
        {group.length === 0 ? (
          <p className="text-dim text-sm py-2">Nothing here. Tell Olive or use the pencil.</p>
        ) : (
          <div className="divide-y divide-signal-dim/15">
            {group.map((t) => (
              <DraggableTask key={t.id} zone={`catlist-${category.id}`} task={t}>
                <TaskCard task={t} {...cardProps} />
              </DraggableTask>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-3 pt-2 border-t border-signal-dim/15">
            <p className="font-data text-[10px] uppercase tracking-widest text-dim/60 mb-1">
              Completed <span className="text-dim/40">· last {done.length}</span>
            </p>
            <div className="divide-y divide-signal-dim/10 opacity-60">
              {done.map((t) => (
                <TaskCard key={t.id} task={t} {...cardProps} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DropZone>
  );
}
