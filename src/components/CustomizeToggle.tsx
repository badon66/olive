// The top-corner pencil: a single ON/OFF toggle for customize mode.
// Supersedes the earlier add-menu pencil. ON = sections show "+" adds,
// become drag-repositionable and horizontally resizable, titles editable.
export function CustomizeToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Finish customizing" : "Customize dashboard"}
      title={on ? "Done customizing" : "Customize"}
      className={`w-11 h-11 grid place-items-center rounded-lg border cursor-pointer transition duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
        on
          ? "border-signal text-signal bg-signal/15 shadow-[0_0_16px_rgba(63,169,104,0.4)] pulse-live"
          : "border-panel-border text-dim hover:text-signal hover:border-signal/40"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>
  );
}
