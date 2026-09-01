// The one reorder control. It belongs in exactly TWO places (BUILD_PLAN):
// Active Tasks and Today's Schedule — nowhere else. It was previously wired into
// Weekly Tasks and the category panels as well; that was over-broad and has been
// removed. Don't reintroduce it elsewhere.

export function ReorderArrow({
  dir,
  disabled,
  label,
  onClick,
}: {
  dir: "up" | "down";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // 32x32 minimum tappable area with a 20px glyph. The old 20x16 button and
      // 12px glyph rendered next to 56px weekly cubes and were effectively
      // invisible — present in the DOM, but nobody could find them.
      className="w-8 h-8 grid place-items-center rounded text-dim enabled:hover:text-signal enabled:hover:bg-signal/10 enabled:cursor-pointer disabled:opacity-25 disabled:cursor-default transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={dir === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
      </svg>
    </button>
  );
}

// The stacked up/down pair as one unit — what callers actually want.
export function ReorderArrows({
  index,
  count,
  label,
  onMove,
  canUp,
  canDown,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (index: number, dir: -1 | 1) => void;
  // Override the index-based end disabling. Today's Schedule passes these at a
  // section's edges when the press carries the task ACROSS the boundary into
  // the neighbouring section — the previous unconditional disabling made that
  // entire feature unreachable: the handler existed, its unit tests passed, and
  // no user could ever fire it. Active Tasks leaves them unset (its arrows are
  // within-section by design).
  canUp?: boolean;
  canDown?: boolean;
}) {
  return (
    <span className="flex flex-col shrink-0" role="group" aria-label={`Reorder ${label}`}>
      <ReorderArrow
        dir="up"
        disabled={canUp !== undefined ? !canUp : index === 0}
        label={`Move ${label} up`}
        onClick={() => onMove(index, -1)}
      />
      <ReorderArrow
        dir="down"
        disabled={canDown !== undefined ? !canDown : index >= count - 1}
        label={`Move ${label} down`}
        onClick={() => onMove(index, 1)}
      />
    </span>
  );
}
