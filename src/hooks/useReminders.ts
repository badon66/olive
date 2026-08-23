import { useCallback, useEffect, useState } from "react";
import { db } from "../lib/db";
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
    const { data, error } = await db.from("reminders").select("*").order("created_at");
    if (!error && data) setReminders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await db.auth.getUser()).data.user!.id;

  return {
    reminders,
    loading,
    refresh,
    addReminder: async (input: ReminderInput) => {
      await db.from("reminders").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateReminder: async (id: string, patch: Partial<ReminderInput>) => {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      await db.from("reminders").update(patch).eq("id", id);
      await refresh();
    },
    deleteReminder: async (id: string) => {
      await db.from("reminders").delete().eq("id", id);
      await refresh();
    },
    // Stamped when an alert is actually shown, so catch-up stays idempotent.
    markFired: async (id: string, when: Date = new Date()) => {
      const iso = when.toISOString();
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, last_fired_at: iso } : r)));
      await db.from("reminders").update({ last_fired_at: iso }).eq("id", id);
    },
  };
}
