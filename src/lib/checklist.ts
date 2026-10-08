// Checklist tasks (BUILD_PLAN, 2026-10-08). Pure rules over checklist rows; the
// store (hooks/useChecklists.ts) does the reading and writing.
//
// A regular task's items carry their own `completed` flag. A WEEKLY task's items
// are shared by every occurrence, and the checked state lives per date in
// weekly_checklist_checks — so Tuesday starts with empty boxes even if Monday's
// were all ticked.

export type ChecklistItemLike = {
  id: string;
  title: string;
  sort_order: number;
  completed: boolean;
};

export type WeeklyCheckLike = {
  checklist_item_id: string;
  date: string;
  completed: boolean;
};

export type ChecklistProgress = { done: number; total: number };

export function sortItems<T extends { sort_order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}

// Progress for a regular task's items: "2/5".
export function checklistProgress(items: ChecklistItemLike[]): ChecklistProgress {
  return { done: items.filter((i) => i.completed).length, total: items.length };
}

// Is a WEEKLY item ticked on this date? Only an explicit row for that exact
// date counts — any other day's tick is a different occurrence.
export function weeklyItemDoneOn(itemId: string, checks: WeeklyCheckLike[], date: string): boolean {
  return checks.some((c) => c.checklist_item_id === itemId && c.date === date && c.completed);
}

// Progress for a weekly occurrence on one date.
export function weeklyChecklistProgress(
  items: ChecklistItemLike[],
  checks: WeeklyCheckLike[],
  date: string,
): ChecklistProgress {
  return {
    done: items.filter((i) => weeklyItemDoneOn(i.id, checks, date)).length,
    total: items.length,
  };
}

// "2/5" for the row chip. Nothing for a task with no checklist.
export function progressLabel(p: ChecklistProgress | null | undefined): string | null {
  if (!p || p.total === 0) return null;
  return `${p.done}/${p.total}`;
}

// The LAST item just got ticked: every item is done and there is at least one.
// This is the moment to ASK ("All items done. Mark it complete?") — never to
// auto-complete.
export function allItemsDone(p: ChecklistProgress): boolean {
  return p.total > 0 && p.done === p.total;
}

// sort_order for an item appended at the end.
export function nextSortOrder(items: { sort_order: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.sort_order)) + 1;
}

// Move the item at `index` one step; returns the renumbered order for the whole
// list (every row gets a dense 0..n-1 value, so a list that was never ordered
// gets a complete order on its first nudge). [] when the move falls off an end.
export function reorderChecklist<T extends { id: string; sort_order: number }>(
  items: T[],
  index: number,
  dir: -1 | 1,
): { id: string; sort_order: number }[] {
  const ordered = sortItems(items);
  const j = index + dir;
  if (index < 0 || index >= ordered.length || j < 0 || j >= ordered.length) return [];
  [ordered[index], ordered[j]] = [ordered[j], ordered[index]];
  return ordered.map((it, i) => ({ id: it.id, sort_order: i }));
}

// Voice/typed capture: titles arrive as a plain list of strings. Trim, drop
// blanks and exact duplicates, keep order — the preview modal shows the result
// so the split can be checked before anything saves.
export function cleanChecklistTitles(titles: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
