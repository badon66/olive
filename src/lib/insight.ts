import type { TimeSection } from "./sections";
import { formatClock } from "./dates";

// The line under the greeting. Aims to answer "what actually matters right
// now" rather than restating counts: the next booked appointment, else the
// top-priority thing in the current part of day, else the state of the day.

export type InsightTask = {
  id: string;
  title: string;
  due_date: string | null;
  scheduled_time: string | null; // "HH:MM:SS"
  time_section: TimeSection | null;
  priority_weight: number;
  created_at: string;
};

export type Insight = { headline: string; stat: string };

const hhmm = (t: string) => t.slice(0, 5);

export function buildInsight(args: {
  open: InsightTask[];
  today: string;
  // Day whose Night is still running (flips 5 AM, vs `today`'s 1:30). Only the
  // "what am I doing right now" pick uses it, so the headline can't contradict
  // Active Tasks during the 1:30–5:00 AM window. Defaults to `today`.
  activeDay?: string;
  nowSection: TimeSection;
  nowTime: string; // "HH:MM" local
  doneToday: number;
  overdue: number;
  dueToday: number;
}): Insight {
  const { open, today, nowSection, nowTime, doneToday, overdue, dueToday } = args;
  const activeDay = args.activeDay ?? today;

  // 1) The next fixed booking still ahead today wins — it's time-bound.
  const nextBooking = open
    .filter((t) => t.due_date === today && t.scheduled_time !== null && hhmm(t.scheduled_time) >= nowTime)
    .sort((a, b) => hhmm(a.scheduled_time!).localeCompare(hhmm(b.scheduled_time!)))[0];

  // 2) Otherwise the highest-priority item sitting in the current part of day.
  const nowTask = open
    .filter((t) => t.due_date === activeDay && (t.time_section ?? "anytime") === nowSection)
    .sort((a, b) => b.priority_weight - a.priority_weight || a.created_at.localeCompare(b.created_at))[0];

  let headline: string;
  if (nextBooking) headline = `Next: ${nextBooking.title} at ${formatClock(nextBooking.scheduled_time!)}`;
  else if (nowTask) headline = `Now: ${nowTask.title}`;
  // Still-due work outranks overdue here: it's what's actionable today.
  else if (dueToday > 0) headline = `${dueToday} due today, nothing timed`;
  else if (overdue > 0) headline = `Nothing due right now — ${overdue} overdue waiting`;
  else headline = "Clear right now — nothing scheduled.";

  const total = doneToday + dueToday + overdue;
  const parts = [total > 0 ? `${doneToday}/${total} done today` : "nothing on the books"];
  if (overdue > 0 && !headline.includes("overdue")) parts.push(`${overdue} overdue`);
  return { headline, stat: parts.join(" · ") };
}
