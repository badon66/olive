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
  canUp,
  canDown,
  children,
}: {
  index: number;
  count: number;
  // Used for the arrows' accessible names — a task title or a weekly task name
  label: string;
  onMove: (index: number, dir: -1 | 1) => void;
  showArrows: boolean;
  // Force-enable an end arrow when the press crosses a section boundary.
  canUp?: boolean;
  canDown?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      {showArrows && (
        <ReorderArrows index={index} count={count} label={label} onMove={onMove} canUp={canUp} canDown={canDown} />
      )}
    </div>
  );
}

// The pure row helpers live in lib/rows.ts so the phone layout uses the very
// same ordering rules (BUILD_PLAN "same brain, different face"). Re-exported
// here for the existing imports.
export { combineRows, liftRows, splitOrderWrites, type ScheduleItem } from "../../lib/rows";
