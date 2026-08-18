// v3 edit-mode pattern: one pencil per section header toggles editing for all
// rows in that section — never per-row edit icons.
export function SectionPencil({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${active ? "Finish editing" : "Edit"} ${label}`}
      className={`w-8 h-8 grid place-items-center rounded cursor-pointer transition duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
        active
          ? "text-signal bg-signal/15 shadow-[0_0_10px_rgba(63,169,104,0.3)]"
          : "text-dim hover:text-signal"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>
  );
}
