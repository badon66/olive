import type { ReactNode } from "react";
import { ReorderArrows } from "../ReorderArrows";

// THE row wrapper for Today's Schedule and Active Tasks.
//
// Arrows are decided by WHICH PANEL renders the item, never by what type it is
// (BUILD_PLAN). Both panels used to have two separate render paths — regular
// tasks through TaskCard (with arrows bolted on) and weekly occurrences through
// bespoke inline JSX (with none) — which is why every previous fix landed on the
// task path only and the weekly rows never got arrows.
//
// Now both types pass through here. The arrow block lives in exactly one place
// and does not branch on item type; only the row's *body* differs, supplied as
// children by the caller.
export function ScheduleRow({
  index,
  count,
  label,
  onMove,
  showArrows,
  children,
}: {
  index: number;
  count: number;
  // Used for the arrows' accessible names — a task title or a weekly task name
  label: string;
  onMove: (index: number, dir: -1 | 1) => void;
  showArrows: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      {showArrows && <ReorderArrows index={index} count={count} label={label} onMove={onMove} />}
    </div>
  );
}

// One ordered list per section holding BOTH kinds, so the arrows move an item
// relative to everything actually on screen rather than only its own type.
export type ScheduleItem<T, W> =
  | { kind: "task"; id: string; label: string; sort: number | null; task: T }
  | { kind: "weekly"; id: string; label: string; sort: number | null; weekly: W };

// Interleave tasks and weekly occurrences by sort_order. Anything never nudged
// (sort null) keeps its incoming relative order behind the placed ones.
export function combineRows<T, W>(
  tasks: ScheduleItem<T, W>[],
  weekly: ScheduleItem<T, W>[],
): ScheduleItem<T, W>[] {
  const all = [...tasks, ...weekly];
  const placed = all.filter((r) => r.sort != null).sort((a, b) => a.sort! - b.sort!);
  const rest = all.filter((r) => r.sort == null);
  return [...placed, ...rest];
}

// Renumber the whole combined list after a move, then split the writes back out
// per underlying table — tasks carry sort_order on `tasks`, weekly occurrences
// on `weekly_tasks`.
export function splitOrderWrites<T, W>(
  ordered: ScheduleItem<T, W>[],
): { tasks: { id: string; sort_order: number }[]; weekly: { id: string; sort_order: number }[] } {
  const tasks: { id: string; sort_order: number }[] = [];
  const weekly: { id: string; sort_order: number }[] = [];
  ordered.forEach((r, i) => {
    if (r.kind === "task") tasks.push({ id: r.id, sort_order: i });
    else weekly.push({ id: r.id, sort_order: i });
  });
  return { tasks, weekly };
}
