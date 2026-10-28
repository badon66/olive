import { isLateBedtime } from "./dayrules";
import { dayIsDone, tasksOnDate } from "./flexible";
import { buildRows, overdueRow, type ActiveRow, type ActiveTaskLike, type ActiveWeeklyLike, type CheckinLike, type ResolvedWeekly } from "./activeRows";
import { computeSections, doneTodayCount, orderBySortOrder, partitionSchedule, scheduleSort, SECTION_ORDER, type TimeSection } from "./sections";
import { pullForward, type BlockedWindow } from "./suggest";
import { appearsOn, needsPlanning, resolveWeeklyDay, type DayOverrideLike } from "./weekly";

// THE "what is on this day" rules for Today's Schedule, as pure functions. The
// desktop panel and the phone's Today tab both build from these (BUILD_PLAN
// "same brain, different face"), so a rule changed here changes both.

type DayTask = ActiveTaskLike & { duration_minutes: number | null; completed_at: string | null };

// What a day's list holds. On the page day (and on the active day, which only
// differs between 1:30 and 5:00 AM) overdue work surfaces inline in its own
// part of the day; any other day shows exactly what occurs on it.
export function dueOnDay<T extends DayTask>(open: T[], date: string, includeOverdue: boolean): T[] {
  if (!includeOverdue) return tasksOnDate(open, date);
  const s = computeSections(open, date);
  return [...s.overdue, ...s.today];
}

// "8 tasks · 3 completed" for the day shown: the day's regular tasks plus its
// weekly occurrences. A pick task already ticked for the day moves from the
// open count to the completed one, never both.
export function dayCounter<T extends DayTask, W extends ActiveWeeklyLike>(args: {
  allTasks: T[];
  dueList: T[];
  weeklyTasks: W[];
  checkins: CheckinLike[];
  date: string;
}): { total: number; done: number } {
  const { allTasks, dueList, weeklyTasks, checkins, date } = args;
  const checkinsOf = (id: string) => checkins.filter((c) => c.weekly_task_id === id);
  const weeklyOn = weeklyTasks.filter((w) => appearsOn(w, checkinsOf(w.id), date));
  const weeklyDone = weeklyOn.filter((w) => checkinsOf(w.id).some((c) => c.date === date && c.status === "completed")).length;
  const tasksDone = doneTodayCount(allTasks, date);
  return {
    total: dueList.filter((t) => !dayIsDone(t, date)).length + tasksDone + weeklyOn.length,
    done: tasksDone + weeklyDone,
  };
}

export function buildDaySchedule<T extends DayTask, W extends ActiveWeeklyLike>(args: {
  viewDate: string;
  // The page day (1:30 AM boundary) — overdue is measured against it.
  today: string;
  dueList: T[];
  // Open tasks feeding pull-forward suggestions; [] on any day but today.
  openTasks: T[];
  weeklyTasks: W[];
  checkins: CheckinLike[];
  dayOverrides?: DayOverrideLike[];
  // A day that is genuinely over — no weekly occurrences, nudges or bedtime rule.
  historical: boolean;
  blockedWindows: BlockedWindow[];
  // Bedtime recorded for the night BEFORE the viewed day.
  prevBedtime: string | null;
}) {
  const { viewDate, today, dueList, openTasks, weeklyTasks, checkins, dayOverrides = [], historical, blockedWindows, prevBedtime } = args;

  const checkinsFor = (id: string) => checkins.filter((c) => c.weekly_task_id === id);
  // Weekly tasks belong to whatever day is being VIEWED, resolved for that day
  // so a one-day rename, section move or pinned time flows into placement.
  const weeklyOnDay: ResolvedWeekly<W>[] = weeklyTasks
    .filter((t) => appearsOn(t, checkinsFor(t.id), viewDate))
    .map((t) => resolveWeeklyDay(t, dayOverrides, viewDate));

  // Count-mode weekly tasks still needing days planned this week.
  const countNudges = historical ? [] : weeklyTasks.filter((t) => needsPlanning(t, checkinsFor(t.id), today));

  // Pull-forward suggestions: unscheduled tasks filling sparse, unblocked sections.
  const pulled = pullForward(openTasks, today, blockedWindows);
  const byId = new Map(openTasks.map((t) => [t.id, t]));
  const pulledFor = (section: TimeSection): T[] =>
    pulled[section].map((id) => byId.get(id)).filter((t): t is T => !!t);

  const partition = partitionSchedule(dueList);

  // Bedtime rule: a late bedtime the night before clears this day's Morning
  // slot and asks where its work should go. Nothing moves until the user picks.
  const morningCleared = !historical && isLateBedtime(prevBedtime);
  const displacedMorning = morningCleared ? (partition.morning ?? []).slice().sort(scheduleSort) : [];
  const displacedWeekly = morningCleared ? weeklyOnDay.filter((w) => (w.time_section ?? "anytime") === "morning") : [];

  // Untouched sections keep the normal schedule sort; manual placement wins.
  const orderedFor = (key: string) => orderBySortOrder(partition[key] ?? []);
  const sectionWeekly = (section: TimeSection) => weeklyOnDay.filter((t) => (t.time_section ?? "anytime") === section);

  // One combined, ordered list per section — tasks AND weekly occurrences —
  // overdue lifted to the top AFTER combining.
  const isOverdue = overdueRow(today) as (row: ActiveRow<T, W>) => boolean;
  const rowsFor = (slotKey: string, weekly: ResolvedWeekly<W>[]): ActiveRow<T, W>[] =>
    buildRows(orderedFor(slotKey), weekly, isOverdue);

  // Sections that visibly hold anything — so a boundary nudge never skips over
  // a section the user can see is populated.
  const occupiedSections = new Set<TimeSection>(
    SECTION_ORDER.filter(
      (s) => (partition[s] ?? []).length > 0 || weeklyOnDay.some((w) => ((w.time_section ?? "anytime") as TimeSection) === s),
    ),
  );

  return {
    weeklyOnDay,
    countNudges,
    pulledFor,
    partition,
    morningCleared,
    displacedMorning,
    displacedWeekly,
    orderedFor,
    sectionWeekly,
    rowsFor,
    occupiedSections,
    isOverdue,
  };
}
