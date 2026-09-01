import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import type { TimeSection } from "../lib/sections";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInput = {
  title: string;
  description?: string | null;
  category_id: string;
  due_date: string | null;
  priority_weight: number;
  scheduled_time?: string | null;
  time_section?: TimeSection | null;
  duration_minutes?: number | null;
  auto_carry_forward?: boolean;
  job_id?: string | null;
  // Flexible scheduling (BUILD_PLAN): either a continuous window OR hand-picked
  // candidate days, never both. placed_date is where the scheduler currently
  // has it; due_date stays the authoritative "when is this happening".
  window_start?: string | null;
  window_end?: string | null;
  candidate_dates?: string[] | null;
  placed_date?: string | null;
};

export type TaskStore = ReturnType<typeof useTasks>;

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Open tasks plus the last 30 days of completed ones. Every completed-task
    // display needs at most 30 days (category panels show the 5 most recent,
    // the Tasks tab 20, doneTodayCount only today) — without this bound the app
    // fetched EVERY task ever written, after EVERY mutation, forever.
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .or(`status.eq.open,completed_at.gte.${cutoff}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority_weight", { ascending: false });
    if (!error && data) setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    tasks,
    loading,
    refresh,
    addTask: async (input: TaskInput) => {
      // Throw on failure — this used to swallow the error, so a constraint
      // violation closed the modal with no task created and no message.
      const { error } = await supabase.from("tasks").insert({ ...input, user_id: await userId() });
      if (error) throw new Error(error.message);
      await refresh();
    },
    // Optimistic: paint the change immediately, then persist and reconcile.
    // A failed write rolls the local row back so the UI never lies.
    updateTask: async (id: string, patch: Partial<TaskInput>) => {
      const before = tasks;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) setTasks(before);
      await refresh();
    },
    completeTask: async (id: string) => {
      const before = tasks;
      const completed_at = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "completed", completed_at } : t)));
      const { error } = await supabase.from("tasks").update({ status: "completed", completed_at }).eq("id", id);
      if (error) setTasks(before);
      await refresh();
    },
    reopenTask: async (id: string) => {
      const before = tasks;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "open", completed_at: null } : t)));
      const { error } = await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", id);
      if (error) setTasks(before);
      await refresh();
    },
    // Persist a section's manual order. Optimistic so the rows visibly swap on
    // the click, then all writes go out together.
    saveOrder: async (updates: { id: string; sort_order: number }[]) => {
      if (updates.length === 0) return;
      const before = tasks;
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t)));
      const results = await Promise.all(
        updates.map((u) => supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id)),
      );
      if (results.some((r) => r.error)) setTasks(before);
      await refresh();
    },
    deleteTask: async (id: string) => {
      // Optimistic: the row leaves the screen immediately; rollback on error.
      const before = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) setTasks(before);
      await refresh();
    },
  };
}
