import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { addDays, edmontonToday } from "../lib/dates";

export type WeeklyTask = Database["public"]["Tables"]["weekly_tasks"]["Row"];
export type WeeklyCheckin = Database["public"]["Tables"]["weekly_task_checkins"]["Row"];
export type WeeklyTaskInput = {
  name: string;
  recurrence_mode: "count" | "fixed_days";
  target_per_week: number | null; // count mode
  scheduled_days: number[] | null; // fixed_days mode, 0=Monday..6=Sunday
  time_section?: WeeklyTask["time_section"];
};

export function useWeeklyTasks() {
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([]);
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // ~4 weeks of history is plenty for the current-week cubes
    const since = addDays(edmontonToday(), -28);
    const [w, c] = await Promise.all([
      supabase.from("weekly_tasks").select("*").order("created_at"),
      supabase.from("weekly_task_checkins").select("*").gte("date", since),
    ]);
    if (!w.error && w.data) setWeeklyTasks(w.data);
    if (!c.error && c.data) setCheckins(c.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  const upsertStatus = async (weeklyTaskId: string, date: string, status: "planned" | "completed") => {
    const { data } = await supabase
      .from("weekly_task_checkins")
      .upsert(
        { weekly_task_id: weeklyTaskId, date, status, user_id: await userId() },
        { onConflict: "weekly_task_id,date" },
      )
      .select("*")
      .single();
    await refresh();
    return data ?? null;
  };

  return {
    weeklyTasks,
    checkins,
    loading,
    refresh,
    addWeeklyTask: async (input: WeeklyTaskInput) => {
      await supabase.from("weekly_tasks").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateWeeklyTask: async (id: string, patch: Partial<WeeklyTaskInput>) => {
      await supabase.from("weekly_tasks").update(patch).eq("id", id);
      await refresh();
    },
    deleteWeeklyTask: async (id: string) => {
      await supabase.from("weekly_tasks").delete().eq("id", id); // checkins cascade
      await refresh();
    },
    // Drag onto a day block (or tap a future cube): lights just that cube
    planDay: (id: string, date: string) => upsertStatus(id, date, "planned"),
    completeDay: (id: string, date: string) => upsertStatus(id, date, "completed"),
    // Unplanning removes the row (fixed_days cubes fall back to their virtual planned state)
    unplanDay: async (id: string, date: string) => {
      await supabase.from("weekly_task_checkins").delete().eq("weekly_task_id", id).eq("date", date);
      await refresh();
    },
    // Un-completing: count-mode keeps the cube planned, fixed_days reverts to virtual planned
    uncompleteDay: async (task: WeeklyTask, date: string) => {
      if (task.recurrence_mode === "count") {
        await supabase
          .from("weekly_task_checkins")
          .update({ status: "planned" })
          .eq("weekly_task_id", task.id)
          .eq("date", date);
      } else {
        await supabase.from("weekly_task_checkins").delete().eq("weekly_task_id", task.id).eq("date", date);
      }
      await refresh();
    },
    saveDetail: async (checkinId: string, detail: { note: string | null; duration_minutes: number | null }) => {
      await supabase.from("weekly_task_checkins").update(detail).eq("id", checkinId);
      await refresh();
    },
  };
}

export type WeeklyStore = ReturnType<typeof useWeeklyTasks>;
