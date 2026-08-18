import { useEffect, useState } from "react";
import { formatCountdown, secondsUntilRollover } from "../lib/dates";

// Live top-corner counter: time remaining until the next 1:30 AM page flip —
// the VIEW boundary, i.e. when the schedule page turns over to the next day.
// (Distinct from the 5:00 AM boundary that ends Night; see lib/dates.ts.)
export function RolloverCountdown() {
  const [secs, setSecs] = useState(() => secondsUntilRollover());

  useEffect(() => {
    const iv = setInterval(() => setSecs(secondsUntilRollover()), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <span
      className="flex items-center gap-1.5 font-data text-[11px]"
      title="Time until the 1:30 AM day rollover"
      aria-label={`${formatCountdown(secs)} until the day rolls over`}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-dim" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="text-signal tabular-nums">{formatCountdown(secs)}</span>
      <span className="hidden 2xl:inline text-dim/70">to rollover</span>
    </span>
  );
}
