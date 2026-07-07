import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { addDays, edmontonToday } from "../lib/dates";

export type Habit = Database["public"]["Tables"]["habits"]["Row"];
export type Checkin = Database["public"]["Tables"]["habit_checkins"]["Row"];

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // 120 days of history is plenty for streaks + week strips
    const since = addDays(edmontonToday(), -120);
    const [h, c] = await Promise.all([
      supabase.from("habits").select("*").order("created_at"),
      supabase.from("habit_checkins").select("*").gte("date", since),
    ]);
    if (!h.error && h.data) setHabits(h.data);
    if (!c.error && c.data) setCheckins(c.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    habits,
    checkins,
    loading,
    refresh,
    addHabit: async (name: string, frequency: "daily" | "weekly") => {
      await supabase.from("habits").insert({ name, frequency, user_id: await userId() });
      await refresh();
    },
    updateHabit: async (id: string, patch: { name?: string; frequency?: "daily" | "weekly" }) => {
      await supabase.from("habits").update(patch).eq("id", id);
      await refresh();
    },
    deleteHabit: async (id: string) => {
      await supabase.from("habits").delete().eq("id", id); // checkins cascade
      await refresh();
    },
    checkIn: async (habitId: string, date: string) => {
      const { data } = await supabase
        .from("habit_checkins")
        .insert({ habit_id: habitId, date, user_id: await userId() })
        .select("*")
        .single();
      await refresh();
      return data ?? null;
    },
    uncheck: async (habitId: string, date: string) => {
      await supabase.from("habit_checkins").delete().eq("habit_id", habitId).eq("date", date);
      await refresh();
    },
    saveDetail: async (checkinId: string, detail: { note: string | null; duration_minutes: number | null }) => {
      await supabase.from("habit_checkins").update(detail).eq("id", checkinId);
      await refresh();
    },
  };
}

export type HabitStore = ReturnType<typeof useHabits>;
