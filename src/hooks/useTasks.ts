import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { edmontonToday } from "../lib/dates";
import { completeDayPatch, reopenPatch, uncompleteDayPatch } from "../lib/flexible";
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
  // Flexible scheduling: either a continuous window OR hand-picked candidate
  // days, never both. The task occurs on EVERY day of whichever set it has
  // (lib/flexible.ts); due_date is the deadline, not a chosen day.
  window_start?: string | null;
  window_end?: string | null;
  candidate_dates?: string[] | null;
  // Per-day completions, pick mode only (see lib/flexible.ts).
  completed_dates?: string[] | null;
  // Set only when an edit changes whether a pick task is finished.
  status?: "open" | "completed";
  completed_at?: string | null;
};

export type TaskStore = ReturnType<typeof useTasks>;

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped by every mutation. A reload only applies if no mutation has started
  // since it was issued — otherwise its data predates that mutation's write.
  // Without this, two quick actions let an OLDER reload land after a newer
  // optimistic change and put a just-moved task back where it was, then the
  // newer reload moved it forward again: a visible jump back and forth. A
  // fresher reload is always coming, because every mutation ends with one.
  const epoch = useRef(0);

  const refresh = useCallback(async () => {
    const issuedAt = epoch.current;
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
    if (issuedAt !== epoch.current) return; // superseded — a newer reload follows
    if (!error && data) setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  // The one path every change goes through: paint it immediately, write it,
  // then reload. A failed write is corrected by that reload (the database still
  // holds the old row) rather than by restoring a snapshot — a snapshot taken
  // before another in-flight change would have silently undone that one too.
  const patchTask = async (id: string, patch: Partial<TaskInput> | Record<string, unknown>) => {
    epoch.current += 1;
    setTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)));
    await supabase.from("tasks").update(patch).eq("id", id);
    await refresh();
  };

  return {
    tasks,
    loading,
    refresh,
    addTask: async (input: TaskInput) => {
      // Throw on failure — this used to swallow the error, so a constraint
      // violation closed the modal with no task created and no message.
      epoch.current += 1;
      const { error } = await supabase.from("tasks").insert({ ...input, user_id: await userId() });
      if (error) throw new Error(error.message);
      await refresh();
    },
    updateTask: (id: string, patch: Partial<TaskInput>) => patchTask(id, patch),
    completeTask: (id: string) => patchTask(id, { status: "completed", completed_at: new Date().toISOString() }),
    // Pick mode completes ONE DAY at a time: finishing Monday leaves Wednesday
    // still showing. completeDayPatch decides when the task as a whole closes —
    // including when a missed day would otherwise have kept it open for ever.
    completeTaskDay: async (id: string, date: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      await patchTask(id, completeDayPatch(task, date, edmontonToday(), new Date().toISOString()));
    },
    uncompleteTaskDay: async (id: string, date: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      await patchTask(id, uncompleteDayPatch(task, date));
    },
    reopenTask: async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      await patchTask(id, task ? reopenPatch(task) : { status: "open", completed_at: null });
    },
    // Persist a section's manual order. Optimistic so the rows visibly swap on
    // the click, then all writes go out together.
    saveOrder: async (updates: { id: string; sort_order: number }[]) => {
      if (updates.length === 0) return;
      epoch.current += 1;
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t)));
      await Promise.all(updates.map((u) => supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id)));
      await refresh();
    },
    deleteTask: async (id: string) => {
      // Optimistic: the row leaves the screen immediately; the reload restores
      // it if the delete failed.
      epoch.current += 1;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      await supabase.from("tasks").delete().eq("id", id);
      await refresh();
    },
  };
}
