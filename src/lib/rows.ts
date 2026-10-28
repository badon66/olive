// One ordered list holding BOTH kinds of row — regular tasks and weekly
// occurrences — so reorder arrows move an item relative to everything actually
// on screen, not only its own kind. Shared by Today's Schedule, Active Tasks
// and the phone's Now/Today tabs (BUILD_PLAN: the phone reuses the same rules,
// only the presentation differs).

export type ScheduleItem<T, W> =
  | { kind: "task"; id: string; label: string; sort: number | null; time?: string | null; task: T }
  | { kind: "weekly"; id: string; label: string; sort: number | null; time?: string | null; weekly: W };

// Interleave tasks and weekly occurrences by sort_order. Anything never nudged
// (sort null) keeps its incoming relative order behind the placed ones.
export function combineRows<T, W>(
  tasks: ScheduleItem<T, W>[],
  weekly: ScheduleItem<T, W>[],
): ScheduleItem<T, W>[] {
  const all = [...tasks, ...weekly];
  const placed = all.filter((r) => r.sort != null).sort((a, b) => a.sort! - b.sort!);
  const rest = all.filter((r) => r.sort == null);
  // Rows with a clock time run in time order — a weekly occurrence pinned to
  // 7 AM for the day used to list below a 10 AM booking, because weekly rows
  // were simply appended after the tasks. Untimed rows keep their incoming
  // order after them (the sort is stable). A manual order still wins.
  const hhmm = (t: string) => t.slice(0, 5);
  const timed = rest.filter((r) => r.time).sort((a, b) => hhmm(a.time!).localeCompare(hhmm(b.time!)));
  const untimed = rest.filter((r) => !r.time);
  return [...placed, ...timed, ...untimed];
}

// Lift rows matching `lifted` to the top, preserving relative order in both
// groups. Applied AFTER combineRows: combineRows re-sorts every row that has a
// sort_order by that value, so an overdue lift applied to the inputs was thrown
// away for any manually-placed row. Post-combine is the only position where the
// lift actually survives to the screen.
export function liftRows<T, W>(
  rows: ScheduleItem<T, W>[],
  lifted: (row: ScheduleItem<T, W>) => boolean,
): ScheduleItem<T, W>[] {
  return [...rows.filter(lifted), ...rows.filter((r) => !lifted(r))];
}

// Renumber the whole combined list after a move, then split the writes back out
// per underlying table — tasks carry sort_order on `tasks`, weekly occurrences
// on `weekly_tasks`.
export function splitOrderWrites<T, W>(
  ordered: ScheduleItem<T, W>[],
): { tasks: { id: string; sort_order: number }[]; weekly: { id: string; sort_order: number }[] } {
  const tasks: { id: string; sort_order: number }[] = [];
  const weekly: { id: string; sort_order: number }[] = [];
  ordered.forEach((r, i) => {
    if (r.kind === "task") tasks.push({ id: r.id, sort_order: i });
    else weekly.push({ id: r.id, sort_order: i });
  });
  return { tasks, weekly };
}

// Swap the row at `index` one step in `dir` and return the renumbered writes
// for both tables. [] / empty when the move would fall off an end.
export function moveRow<T, W>(
  rows: ScheduleItem<T, W>[],
  index: number,
  dir: -1 | 1,
): { tasks: { id: string; sort_order: number }[]; weekly: { id: string; sort_order: number }[] } | null {
  const j = index + dir;
  if (index < 0 || index >= rows.length || j < 0 || j >= rows.length) return null;
  const next = [...rows];
  [next[index], next[j]] = [next[j], next[index]];
  return splitOrderWrites(next);
}

export const rowKey = <T, W>(r: ScheduleItem<T, W>) => `${r.kind}-${r.id}`;
