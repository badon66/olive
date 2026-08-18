// Day-scoped rules that override a day's normal schedule shape.

// "Bedtime rule of thumb" (BUILD_PLAN): if the bedtime for the night before is
// later than 11:00 PM, that next day's Morning tasks come out of the Morning
// slot and the user is asked where to move them.
//
// Bedtimes in the small hours (00:00–04:59) are LATER than 11 PM in real terms
// even though they sort lower as strings — 5:00 AM is the cutoff, matching the
// resolved Night boundary (11 PM – 5 AM). 11:00 PM exactly is not "later than".
export function isLateBedtime(bedtime: string | null | undefined): boolean {
  if (!bedtime) return false;
  const hhmm = bedtime.slice(0, 5);
  return hhmm > "23:00" || hhmm < "05:00";
}

type CarryTask = {
  due_date: string | null;
  auto_carry_forward: boolean;
};

// Tasks to surface under "Carryover Tasks" for `today`.
//
// CARRYOVER IS MANUAL. Nothing moves a task's due_date on the user's behalf —
// there is no cron, no auto-bump. An opted-in task that goes overdue simply
// STAYS on its original date and shows up here. It leaves this list only when
// the user does something about it: dragging it onto a day/section, or opening
// it and setting a new date. Both of those change `due_date`, which is exactly
// what drops it out of the filter below — no extra bookkeeping needed.
//
// An earlier build bumped due_date nightly via pg_cron; that was wrong and has
// been removed (migration 20260813000003), along with the `carried_forward_on`
// stamp column that only existed to support it.
export function carryoverTasks<T extends CarryTask>(open: T[], today: string): T[] {
  return open.filter((t) => t.auto_carry_forward && t.due_date !== null && t.due_date < today);
}
