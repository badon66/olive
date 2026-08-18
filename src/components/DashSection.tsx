import type { ReactNode } from "react";

// One dashboard panel. In customize mode the header shows a "+" to add straight
// into this section — that is the ONLY thing the pencil toggles.
export function DashSection({
  title,
  customize,
  onAdd,
  hint,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  customize: boolean;
  onAdd?: () => void;
  hint?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`hud-panel flex flex-col min-h-0 ${className}`}>
      <header className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5 shrink-0">
        <h2 className="font-display text-[10.5px] font-semibold tracking-[0.22em] uppercase text-signal truncate">
          {title}
        </h2>
        <span className="flex items-center gap-1.5 shrink-0">
          {hint}
          {customize && onAdd && (
            <button
              onClick={onAdd}
              aria-label={`Add to ${title}`}
              className="w-7 h-7 grid place-items-center rounded border border-signal/50 text-signal cursor-pointer hover:bg-signal/15 hover:shadow-[0_0_10px_rgba(63,169,104,0.3)] transition duration-150 focus-visible:outline-2 focus-visible:outline-signal"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </span>
      </header>
      <div className={`px-3 pb-3 flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}
