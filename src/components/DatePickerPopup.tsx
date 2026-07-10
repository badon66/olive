import { useEffect, useRef, useState } from "react";
import { addDays, edmontonToday, formatDue } from "../lib/dates";

// Popup mini calendar (BUILD_PLAN: not a native date input, no prominent year
// selector — everything defaults to the current year). Month grid, Mon-first.

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function DatePickerPopup({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const today = edmontonToday();
  const anchor = value ?? today;
  const [year, setYear] = useState(Number(anchor.slice(0, 4)));
  const [month, setMonth] = useState(Number(anchor.slice(5, 7)) - 1); // 0-based
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDowMon0 = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDowMon0 }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (dir: -1 | 1) => {
    const m = month + dir;
    if (m < 0) {
      setMonth(11);
      setYear(year - 1);
    } else if (m > 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(m);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hud-input text-left cursor-pointer flex items-center justify-between gap-2"
      >
        <span className={value ? "" : "text-dim"}>{value ? `${value} (${formatDue(value, today)})` : "No due date"}</span>
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-dim shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 3v3M16 3v3" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a due date"
          className="absolute z-50 mt-1 left-0 right-0 sm:right-auto sm:w-72 hud-panel !bg-[rgba(8,20,14,0.97)] p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="w-9 h-9 grid place-items-center text-dim hover:text-signal cursor-pointer rounded">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span className="font-display text-xs tracking-[0.15em] uppercase text-hud">{monthLabel(year, month)}</span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="w-9 h-9 grid place-items-center text-dim hover:text-signal cursor-pointer rounded">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="text-center font-data text-[10px] text-dim py-1">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) =>
              day === null ? (
                <span key={`x${i}`} />
              ) : (
                (() => {
                  const dateIso = iso(year, month, day);
                  const isToday = dateIso === today;
                  const isSelected = dateIso === value;
                  return (
                    <button
                      key={dateIso}
                      type="button"
                      onClick={() => {
                        onChange(dateIso);
                        setOpen(false);
                      }}
                      aria-label={dateIso}
                      className={`h-8 rounded font-data text-xs cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? "bg-signal-dim text-hud shadow-[0_0_8px_rgba(63,169,104,0.4)]"
                          : isToday
                            ? "text-signal border border-signal/40"
                            : "text-hud/80 hover:bg-signal/10"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })()
              ),
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="hud-button flex-1 !min-h-[34px] !text-[10px]"
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="hud-button flex-1 !min-h-[34px] !text-[10px]"
              onClick={() => {
                onChange(addDays(today, 1));
                setOpen(false);
              }}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className="hud-button flex-1 !min-h-[34px] !text-[10px] !border-dim/30 !text-dim"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
