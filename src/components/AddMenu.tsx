import { useEffect, useRef, useState } from "react";

export type AddKind = "task" | "weekly" | "category";

// The revised editing pattern's second half: ONE pencil in the top corner of
// the main content opens an "add new" menu — replacing scattered add buttons.
export function AddMenu({ onSelect }: { onSelect: (kind: AddKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item = (kind: AddKind, label: string) => (
    <button
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onSelect(kind);
      }}
      className="w-full text-left px-3.5 py-2.5 font-body text-[15px] text-hud hover:bg-signal/10 hover:text-signal cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal"
    >
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add new"
        className={`w-11 h-11 grid place-items-center rounded-lg border cursor-pointer transition-all duration-200 focus-visible:outline-2 focus-visible:outline-signal ${
          open
            ? "border-signal/50 text-signal bg-signal/10 shadow-[0_0_14px_rgba(63,169,104,0.3)]"
            : "border-panel-border text-dim hover:text-signal hover:border-signal/40"
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Add new"
          className="absolute right-0 top-12 z-50 w-52 hud-panel !bg-[rgba(8,20,14,0.97)] py-1.5"
        >
          {item("task", "Add task")}
          {item("weekly", "Add weekly task")}
          {item("category", "Add category")}
          <div
            className="px-3.5 py-2.5 font-body text-[15px] text-dim/50 cursor-default flex items-center justify-between"
            aria-disabled="true"
          >
            Add job
            <span className="font-data text-[9px] tracking-wider">PHASE 3</span>
          </div>
        </div>
      )}
    </div>
  );
}
