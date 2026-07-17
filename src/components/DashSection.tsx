import { useEffect, useRef, type ReactNode } from "react";

// Chrome for one dashboard grid section. In customize mode the title becomes
// an editable field (any section is renamable, built-ins included) and an
// optional "+" appears for adding straight into the section. Reports its
// natural content height so the grid can size the item to real content.
export function DashSection({
  sectionKey,
  title,
  customize,
  onRename,
  onAdd,
  hint,
  onMeasure,
  children,
}: {
  sectionKey: string;
  title: string;
  customize: boolean;
  onRename: (label: string) => void;
  onAdd?: () => void;
  hint?: ReactNode;
  onMeasure: (key: string, px: number) => void;
  children: ReactNode;
}) {
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const report = () => onMeasure(sectionKey, el.offsetHeight);
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, [sectionKey, onMeasure]);

  return (
    <section className={`hud-panel h-full ${customize ? "cursor-grab active:cursor-grabbing !border-signal/45" : ""}`}>
      <div ref={inner} className="p-4">
        <header className="flex items-center justify-between mb-2 gap-2">
          {customize ? (
            <input
              className="flex-1 min-w-0 bg-transparent border-b border-dashed border-signal/50 font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal focus:outline-none focus:border-signal"
              defaultValue={title}
              aria-label={`Rename ${title}`}
              onBlur={(e) => onRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <h2 className="font-display text-xs font-semibold tracking-[0.25em] uppercase text-signal truncate">
              {title}
            </h2>
          )}
          <span className="flex items-center gap-1.5 shrink-0">
            {hint}
            {customize && onAdd && (
              <button
                onClick={onAdd}
                aria-label={`Add to ${title}`}
                className="w-8 h-8 grid place-items-center rounded border border-signal/50 text-signal cursor-pointer hover:bg-signal/15 hover:shadow-[0_0_10px_rgba(63,169,104,0.3)] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-signal"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </span>
        </header>
        {children}
      </div>
    </section>
  );
}
