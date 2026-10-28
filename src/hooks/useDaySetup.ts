import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays } from "../lib/dates";
import type { BlockedWindow } from "../lib/api";

export type DaySetup = { wake_time: string; blocked_windows: BlockedWindow[] } | null;

// The day's schedule setup (wake time + blocked windows) and the bedtime from
// the night BEFORE it — a late one clears that day's Morning (the bedtime
// rule). Shared by the desktop Today's Schedule and the phone's Now/Today tabs.
export function useDaySetup(date: string): { setup: DaySetup; prevBedtime: string | null } {
  const [setup, setSetup] = useState<DaySetup>(null);
  const [prevBedtime, setPrevBedtime] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const prevDay = addDays(date, -1);
    void supabase
      .from("daily_schedule_setup")
      .select("date, wake_time, bedtime, blocked_windows")
      .in("date", [prevDay, date])
      .then(({ data }) => {
        if (!alive) return;
        const rows = data ?? [];
        const own = rows.find((r) => r.date === date);
        const prev = rows.find((r) => r.date === prevDay);
        setSetup(own ? { wake_time: own.wake_time, blocked_windows: (own.blocked_windows ?? []) as BlockedWindow[] } : null);
        setPrevBedtime(prev?.bedtime ?? null);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  return { setup, prevBedtime };
}
