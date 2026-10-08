import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { addDays, edmontonToday } from "../lib/dates";
import {
  checklistProgress,
  nextSortOrder,
  reorderChecklist,
  sortItems,
  weeklyChecklistProgress,
  weeklyItemDoneOn,
  type ChecklistProgress,
} from "../lib/checklist";

// Checklist tasks (BUILD_PLAN, 2026-10-08). One store for every checklist in
// the app, read through a context so the row chips ("2/5") and the popup
// editors never have to be threaded through six panels by hand.
//
// Regular-task items carry their own `completed` flag. Weekly-task items are
// shared by every occurrence and ticked per DATE in weekly_checklist_checks.

export type ChecklistItem = Database["public"]["Tables"]["task_checklist_items"]["Row"];
export type WeeklyCheck = Database["public"]["Tables"]["weekly_checklist_checks"]["Row"];
export type ChecklistParent = { task_id: string } | { weekly_task_id: string };

const parentMatches = (item: ChecklistItem, parent: ChecklistParent) =>
  "task_id" in parent ? item.task_id === parent.task_id : item.weekly_task_id === parent.weekly_task_id;

export function useChecklists() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<WeeklyCheck[]>([]);
  const [loading, setLoading] = useState(true);
  // Same reload guard as useTasks: a reload only applies if no mutation has
  // started since it was issued, so a slow read can't undo a fast tick.
  const epoch = useRef(0);

  const refresh = useCallback(async () => {
    const issuedAt = epoch.current;
    // Every item (the table is small — a handful of lists), and the last four
    // weeks of weekly ticks, which covers the cubes, the Upcoming Days blocks
    // and the schedule's stepping range.
    const since = addDays(edmontonToday(), -28);
    const [i, c] = await Promise.all([
      supabase.from("task_checklist_items").select("*").order("sort_order").order("created_at"),
      supabase.from("weekly_checklist_checks").select("*").gte("date", since),
    ]);
    if (issuedAt !== epoch.current) return;
    if (!i.error && i.data) setItems(i.data);
    if (!c.error && c.data) setChecks(c.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  const itemsForTask = (taskId: string) => sortItems(items.filter((i) => i.task_id === taskId));
  const itemsForWeekly = (weeklyId: string) => sortItems(items.filter((i) => i.weekly_task_id === weeklyId));

  const taskProgress = (taskId: string): ChecklistProgress | null => {
    const mine = itemsForTask(taskId);
    return mine.length === 0 ? null : checklistProgress(mine);
  };
  const weeklyProgress = (weeklyId: string, date: string): ChecklistProgress | null => {
    const mine = itemsForWeekly(weeklyId);
    return mine.length === 0 ? null : weeklyChecklistProgress(mine, checks, date);
  };
  const isWeeklyItemDone = (itemId: string, date: string) => weeklyItemDoneOn(itemId, checks, date);

  // Paint first, write, then reload — the same optimistic shape as every other
  // direct action in the app. A failed write is corrected by the reload.
  const addItems = async (parent: ChecklistParent, titles: string[]) => {
    const clean = titles.map((t) => t.trim()).filter(Boolean);
    if (clean.length === 0) return;
    epoch.current += 1;
    const uid = await userId();
    const existing = items.filter((i) => parentMatches(i, parent));
    let next = nextSortOrder(existing);
    const rows = clean.map((title) => ({
      user_id: uid,
      task_id: "task_id" in parent ? parent.task_id : null,
      weekly_task_id: "weekly_task_id" in parent ? parent.weekly_task_id : null,
      title,
      sort_order: next++,
      completed: false,
    }));
    setItems((prev) => [
      ...prev,
      ...rows.map((r, k) => ({ ...r, id: `optimistic-${Date.now()}-${k}`, completed_at: null, created_at: new Date().toISOString() })),
    ]);
    await supabase.from("task_checklist_items").insert(rows);
    await refresh();
  };

  const renameItem = async (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    epoch.current += 1;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: t } : i)));
    await supabase.from("task_checklist_items").update({ title: t }).eq("id", id);
    await refresh();
  };

  const removeItem = async (id: string) => {
    epoch.current += 1;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("task_checklist_items").delete().eq("id", id); // weekly checks cascade
    await refresh();
  };

  const moveItem = async (parent: ChecklistParent, index: number, dir: -1 | 1) => {
    const updates = reorderChecklist(items.filter((i) => parentMatches(i, parent)), index, dir);
    if (updates.length === 0) return;
    epoch.current += 1;
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
    setItems((prev) => prev.map((i) => (byId.has(i.id) ? { ...i, sort_order: byId.get(i.id)! } : i)));
    await Promise.all(
      updates.map((u) => supabase.from("task_checklist_items").update({ sort_order: u.sort_order }).eq("id", u.id)),
    );
    await refresh();
  };

  // Regular-task tick: saves instantly, no Save button (BUILD_PLAN).
  const setItemDone = async (id: string, done: boolean) => {
    epoch.current += 1;
    const completed_at = done ? new Date().toISOString() : null;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: done, completed_at } : i)));
    await supabase.from("task_checklist_items").update({ completed: done, completed_at }).eq("id", id);
    await refresh();
  };

  // Weekly tick for ONE date. Writes a row for that (item, date) only; every
  // other day's boxes are untouched.
  const setWeeklyCheck = async (itemId: string, date: string, done: boolean) => {
    epoch.current += 1;
    setChecks((prev) => {
      const rest = prev.filter((c) => !(c.checklist_item_id === itemId && c.date === date));
      return [
        ...rest,
        { id: `optimistic-${itemId}-${date}`, checklist_item_id: itemId, date, completed: done } as WeeklyCheck,
      ];
    });
    await supabase
      .from("weekly_checklist_checks")
      .upsert({ checklist_item_id: itemId, date, completed: done, user_id: await userId() }, { onConflict: "checklist_item_id,date" });
    await refresh();
  };

  // Task ↔ weekly conversion keeps the checklist: the items move to the new
  // parent instead of cascading away with the old one. Weekly items start
  // unticked (their state is per date); items coming back to a task start
  // unticked too, since the weekly side never used the item flag.
  const moveItems = async (from: ChecklistParent, to: ChecklistParent) => {
    epoch.current += 1;
    const patch = {
      task_id: "task_id" in to ? to.task_id : null,
      weekly_task_id: "weekly_task_id" in to ? to.weekly_task_id : null,
      completed: false,
      completed_at: null,
    };
    setItems((prev) => prev.map((i) => (parentMatches(i, from) ? { ...i, ...patch } : i)));
    const q = supabase.from("task_checklist_items").update(patch);
    if ("task_id" in from) await q.eq("task_id", from.task_id);
    else await q.eq("weekly_task_id", from.weekly_task_id);
    await refresh();
  };

  return {
    items,
    checks,
    loading,
    refresh,
    itemsForTask,
    itemsForWeekly,
    taskProgress,
    weeklyProgress,
    isWeeklyItemDone,
    addItems,
    addItem: (parent: ChecklistParent, title: string) => addItems(parent, [title]),
    renameItem,
    removeItem,
    moveItem,
    setItemDone,
    setWeeklyCheck,
    moveItems,
  };
}

export type ChecklistStore = ReturnType<typeof useChecklists>;

// Null outside a provider (e.g. a component rendered somewhere the store isn't
// wired), in which case rows simply show no count and forms show no checklist.
export const ChecklistContext = createContext<ChecklistStore | null>(null);
export const useChecklistStore = () => useContext(ChecklistContext);
