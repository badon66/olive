import { dayIsDone, type ScheduledTask } from "./flexible";
import { combineRows, liftRows, type ScheduleItem } from "./rows";
import { anytimeShowsInMain, orderBySortOrder, scheduleSort, splitAnytime, splitSurfaced, type TimeSection } from "./sections";
import { appearsOn, resolveWeeklyDay, type DayOverrideLike, type OverrideField } from "./weekly";

// THE Active Tasks rules, as one pure function (BUILD_PLAN "same brain,
// different face"): the desktop panel and the phone's Now tab both call this,
// so neither can drift from the other. Everything the spec says about Active
// Tasks lives here —
//   • only the CURRENT part of the day, on the ACTIVE day (5 AM boundary);
//   • anytime work: shown directly when the section has nothing of its own,
//     folded into a dropdown when it does, except what priority surfaces
//     (urgent always; medium while the section has ≤ 2 uncompleted own items);
//   • weekly occurrences count as the section's own work and obey the same
//     priority meanings;
//   • overdue sorts to the top of the whole main list, even for surfaced rows.

export type ActiveTaskLike = ScheduledTask & {
  title: string;
  time_section: TimeSection | null;
  sort_order: number | null;
  scheduled_time: string | null;
  priority_weight: number;
  created_at: string;
};

export type ActiveWeeklyLike = {
  id: string;
  name: string;
  recurrence_mode: "count" | "fixed_days";
  scheduled_days: number[] | null;
  target_per_week: number | null;
  paused?: boolean | null;
  sort_order: number | null;
  time_section: TimeSection | null;
  priority_weight: number;
};

export type CheckinLike = { weekly_task_id: string; date: string; status: "planned" | "completed" | "skipped" };

// A weekly occurrence resolved for the day on screen — name/section may come
// from a one-day override, plus any clock time pinned for that day.
export type ResolvedWeekly<W> = W & { scheduled_time: string | null; overridden: OverrideField[] };

export type ActiveRow<T, W> = ScheduleItem<T, ResolvedWeekly<W>>;

// Combine + overdue-lift, the row order every day-grouped list uses.
export function buildRows<T extends ActiveTaskLike, W extends ActiveWeeklyLike>(
  tasks: T[],
  weekly: ResolvedWeekly<W>[],
  isOverdue: (row: ActiveRow<T, W>) => boolean,
): ActiveRow<T, W>[] {
  return liftRows(
    combineRows<T, ResolvedWeekly<W>>(
      orderBySortOrder(tasks).map((t) => ({
        kind: "task" as const,
        id: t.id,
        label: t.title,
        sort: t.sort_order,
        time: t.scheduled_time,
        task: t,
      })),
      weekly.map((w) => ({
        kind: "weekly" as const,
        id: w.id,
        label: w.name,
        sort: w.sort_order,
        time: w.scheduled_time,
        weekly: w,
      })),
    ),
    isOverdue,
  );
}

export const overdueRow =
  (today: string) =>
  <T extends { due_date: string | null }, W>(r: ScheduleItem<T, W>) =>
    r.kind === "task" && r.task.due_date !== null && r.task.due_date < today;

export type ActiveRows<T, W> = {
  // The section's own rows, in order (tasks + weekly occurrences).
  ownRows: ActiveRow<T, W>[];
  // What renders in the main list, overdue first.
  mainRows: ActiveRow<T, W>[];
  // Anytime work surfaced by priority (its own collapsible group under the main list).
  surfacedRows: ActiveRow<T, W>[];
  // Anytime work folded away behind the "Anytime" dropdown.
  dropdown: ActiveRow<T, W>[];
  // True when the section had nothing of its own and anytime work filled it.
  promoted: boolean;
  total: number;
  // The section's own uncompleted items — the "light section" test.
  ownUncompleted: number;
  isWeeklyDone: (weeklyId: string) => boolean;
  isOverdue: (row: ActiveRow<T, W>) => boolean;
};

export function buildActiveRows<T extends ActiveTaskLike, W extends ActiveWeeklyLike>(args: {
  section: TimeSection;
  // Open tasks that occur on the active day (overdue + today).
  dueToday: T[];
  today: string;
  weeklyTasks: W[];
  checkins: CheckinLike[];
  dayOverrides?: DayOverrideLike[];
}): ActiveRows<T, W> {
  const { section, dueToday, today, weeklyTasks, checkins, dayOverrides = [] } = args;
  const sectionOf = (ts: string | null) => ts ?? "anytime";

  // Anytime is CONDITIONAL, so the two groups are kept apart right from the
  // source data rather than merged and re-separated later.
  const sectionTasks = dueToday.filter((t) => sectionOf(t.time_section) === section).sort(scheduleSort);
  const anytimeTasks = dueToday.filter((t) => sectionOf(t.time_section) === "anytime").sort(scheduleSort);

  const checkinsFor = (id: string) => checkins.filter((c) => c.weekly_task_id === id);
  const isWeeklyDone = (id: string) => checkinsFor(id).some((c) => c.date === today && c.status === "completed");
  const weeklyIn = (want: string): ResolvedWeekly<W>[] =>
    weeklyTasks
      .filter((t) => appearsOn(t, checkinsFor(t.id), today))
      // Resolved BEFORE the section filter: a day override can move an
      // occurrence into a different part of the day, which decides whether it
      // belongs in this list at all.
      .map((t) => resolveWeeklyDay(t, dayOverrides, today))
      .filter((t) => sectionOf(t.time_section) === want);
  const sectionWeekly = weeklyIn(section);
  const anytimeWeekly = section === "anytime" ? [] : weeklyIn("anytime");

  // How busy is the current section, in UNCOMPLETED work of its own? Anytime
  // tasks are excluded by construction.
  const ownUncompleted =
    sectionTasks.filter((t) => !dayIsDone(t, today)).length + sectionWeekly.filter((w) => !isWeeklyDone(w.id)).length;

  const isOverdue = overdueRow(today) as (row: ActiveRow<T, W>) => boolean;
  const ownRows = buildRows(sectionTasks, sectionWeekly, isOverdue);
  const priorityOf = (r: ActiveRow<T, W>) => (r.kind === "task" ? r.task.priority_weight : r.weekly.priority_weight);
  const surfaces = (r: ActiveRow<T, W>) => anytimeShowsInMain(priorityOf(r), ownUncompleted);
  const split = splitAnytime(ownRows, buildRows(anytimeTasks, anytimeWeekly, isOverdue), surfaces);
  const promoted = ownRows.length === 0 && split.primary.length > 0;
  const primary = liftRows(split.primary, isOverdue);
  const key = (r: ActiveRow<T, W>) => `${r.kind}-${r.id}`;
  const ownIds = new Set(ownRows.map(key));
  const { main, surfaced } = promoted
    ? { main: primary, surfaced: [] as ActiveRow<T, W>[] }
    : splitSurfaced(primary, (r) => ownIds.has(key(r)), isOverdue);

  return {
    ownRows,
    mainRows: main,
    surfacedRows: surfaced,
    dropdown: split.dropdown,
    promoted,
    total: primary.length + split.dropdown.length,
    ownUncompleted,
    isWeeklyDone,
    isOverdue,
  };
}
