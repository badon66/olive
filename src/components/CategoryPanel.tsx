import type { CategoryRow } from "../hooks/useCategories";
import type { Task } from "../hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { DraggableTask, DropZone } from "./board/TaskDnd";

type CardProps = {
  today: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
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
  const group = tasks.filter((t) => t.status === "open" && t.category_id === category.id);
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
      </div>
    </DropZone>
  );
}
