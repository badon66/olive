import { PRIORITY_LEVELS, type Priority } from "../lib/priority";

// The ONE priority picker (BUILD_PLAN): three levels, each showing its meaning,
// not just a number. Used by the task form, the weekly-task form and anywhere
// else a priority is chosen. 3 = most important.
export function PriorityPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Priority, 1 low to 3 urgent">
      {PRIORITY_LEVELS.map((level) => {
        const selected = value === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${level.value} — ${level.label}: ${level.meaning}`}
            onClick={() => onChange(level.value)}
            className={`flex-1 min-h-[44px] rounded border px-2 py-1.5 text-left cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
              selected
                ? level.value === 3
                  ? "border-amber text-amber bg-amber/10 shadow-[0_0_8px_rgba(255,180,84,0.25)]"
                  : "border-signal text-signal bg-signal/10 shadow-[0_0_8px_rgba(63,169,104,0.25)]"
                : "border-signal-dim/40 text-dim hover:border-signal-dim"
            }`}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="font-data text-sm">{level.value}</span>
              <span className="font-body font-semibold text-sm">{level.label}</span>
            </span>
            {!compact && (
              <span className={`block font-data text-[10px] leading-snug mt-0.5 ${selected ? "opacity-90" : "opacity-70"}`}>
                {level.meaning}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Compact read-only marker for rows: filled bars out of 3, with the meaning
// in the accessible name so "▮▮▮" is never the only description.
export function PriorityBars({ value, className = "" }: { value: number; className?: string }) {
  const p = Math.max(1, Math.min(3, Math.round(value)));
  const label = PRIORITY_LEVELS.find((l) => l.value === p)!.label.toLowerCase();
  return (
    <span
      className={`font-data text-[0.65rem] tracking-widest ${p === 3 ? "text-amber" : "text-dim"} ${className}`}
      aria-label={`Priority ${p} of 3 — ${label}`}
      title={`Priority ${p} of 3 — ${label}`}
    >
      {"▮".repeat(p)}
      <span className="opacity-30">{"▮".repeat(3 - p)}</span>
    </span>
  );
}
