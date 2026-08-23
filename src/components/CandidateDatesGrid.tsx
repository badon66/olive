import { useState } from "react";
import { addDays, edmontonToday } from "../lib/dates";
import { mondayIndex, mondayOf } from "../lib/weekly";

const DAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

// Calendar-grid multi-select for a flexible task's hand-picked candidate days
// (BUILD_PLAN). Monday-first to match the weekly cubes. Tapping a day toggles it
// in or out of the set; the scheduler then picks whichever of the chosen days is
// least busy.
export function CandidateDatesGrid({
  value,
  onChange,
}: {
  value: string[];
  // Accepts an updater, not just a value. Toggling MUST derive from the latest
  // state: two taps in the same React batch both read the same captured `value`,
  // so a plain onChange(next) makes the second overwrite the first — picking
  // three days in quick succession kept only the last one.
  onChange: (next: string[] | ((prev: string[]) => string[])) => void;
}) {
  const today = edmontonToday();
  const anchor = value.length > 0 ? [...value].sort()[0] : today;
  const [year, setYear] = useState(Number(anchor.slice(0, 4)));
  const [month, setMonth] = useState(Number(anchor.slice(5, 7)) - 1);

  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = mondayIndex(first); // blank cells before the 1st
  const gridStart = addDays(mondayOf(first), 0);

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  void gridStart;

  const selected = new Set(value);
  const toggle = (d: string) =>
    onChange((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return [...next].sort();
    });

  const step = (delta: number) => {
    const m = month + delta;
    if (m < 0) { setMonth(11); setYear(year - 1); }
    else if (m > 11) { setMonth(0); setYear(year + 1); }
    else setMonth(m);
  };

  return (
    <div className="border border-signal-dim/25 rounded-md p-2">
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="w-8 h-8 grid place-items-center rounded text-dim hover:text-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="font-data text-[11px] uppercase tracking-widest text-dim">{monthLabel(year, month)}</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="w-8 h-8 grid place-items-center rounded text-dim hover:text-signal cursor-pointer focus-visible:outline-2 focus-visible:outline-signal"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_HEADS.map((d, i) => (
          <span key={i} className="font-data text-[9px] text-dim/60 text-center">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`b${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={selected.has(d)}
              aria-label={`${d}${selected.has(d) ? " (selected)" : ""}`}
              className={`h-9 rounded font-data text-[11px] cursor-pointer border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-signal ${
                selected.has(d)
                  ? "bg-signal-dim border-signal text-hud"
                  : d < today
                    ? "border-transparent text-dim/35 hover:border-signal-dim/30"
                    : "border-signal-dim/20 text-dim hover:border-signal/50 hover:text-signal"
              }`}
            >
              {Number(d.slice(8, 10))}
            </button>
          ),
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="font-data text-[10px] text-dim">
          {value.length === 0 ? "no days picked" : `${value.length} day${value.length === 1 ? "" : "s"} picked`}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="font-data text-[10px] text-dim hover:text-signal cursor-pointer rounded px-1 focus-visible:outline-2 focus-visible:outline-signal"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
