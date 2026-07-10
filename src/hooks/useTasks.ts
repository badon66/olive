import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import type { TimeSection } from "../lib/sections";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInput = {
  title: string;
  category_id: string;
  due_date: string | null;
  priority_weight: number;
  scheduled_time?: string | null;
  time_section?: TimeSection | null;
  duration_minutes?: number | null;
};

export type TaskStore = ReturnType<typeof useTasks>;

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
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
      await supabase.from("tasks").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateTask: async (id: string, patch: Partial<TaskInput>) => {
      await supabase.from("tasks").update(patch).eq("id", id);
      await refresh();
    },
    completeTask: async (id: string) => {
      await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      await refresh();
    },
    reopenTask: async (id: string) => {
      await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", id);
      await refresh();
    },
    deleteTask: async (id: string) => {
      await supabase.from("tasks").delete().eq("id", id);
      await refresh();
    },
  };
}
