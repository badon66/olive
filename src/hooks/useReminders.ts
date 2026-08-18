import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import type { RecurrenceType } from "../lib/reminders";

export type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
export type ReminderInput = {
  name: string;
  message?: string | null;
  recurrence_type: RecurrenceType;
  fire_at?: string | null;
  interval_minutes?: number | null;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  time_of_day?: string | null;
  active?: boolean;
};

export type ReminderStore = ReturnType<typeof useReminders>;

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("reminders").select("*").order("created_at");
    if (!error && data) setReminders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    reminders,
    loading,
    refresh,
    addReminder: async (input: ReminderInput) => {
      await supabase.from("reminders").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateReminder: async (id: string, patch: Partial<ReminderInput>) => {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      await supabase.from("reminders").update(patch).eq("id", id);
      await refresh();
    },
    deleteReminder: async (id: string) => {
      await supabase.from("reminders").delete().eq("id", id);
      await refresh();
    },
    // Stamped when an alert is actually shown, so catch-up stays idempotent.
    markFired: async (id: string, when: Date = new Date()) => {
      const iso = when.toISOString();
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, last_fired_at: iso } : r)));
      await supabase.from("reminders").update({ last_fired_at: iso }).eq("id", id);
    },
  };
}
