import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import type { RecurrenceType } from "../lib/reminders";

export type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
export type ReminderFire = Database["public"]["Tables"]["reminder_fires"]["Row"];
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
  // Alert policy (BUILD_PLAN): which sound, how loud, and how insistently.
  // NOT NULL with defaults in the schema — omitted, never explicitly null.
  sound_id?: string;
  volume?: number;
  max_repeats?: number;
  repeat_interval_seconds?: number;
};

export type ReminderStore = ReturnType<typeof useReminders>;

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  // Undismissed firing instances — the alert queue. A row here outlives a page
  // reload, which is what lets an occurrence that came due while the app was
  // closed still raise its alert when the app comes back.
  const [fires, setFires] = useState<ReminderFire[]>([]);
  // The global "Reminders Active" master switch. Defaults to ON so a missing
  // settings row can never silently disable every reminder.
  const [globallyEnabled, setGloballyEnabledState] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Fire rows are permanent history and accumulate: one reminder on a
    // 45-minute interval banked 34 rows in a single day, and an unbounded
    // "every undismissed fire" fetch would grow without limit while returning
    // rows that can no longer alert.
    //
    // The alert queue only ever needs fires that could still be owed an
    // attempt. The repeat policy caps at 100 attempts x 3600s, so nothing older
    // than ~4.2 days can still be alerting; a 7-day window clears that with
    // room to spare. Exhausted rows inside the window are still filtered by
    // isExhausted, which is the authoritative per-reminder check.
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [{ data, error }, { data: fireRows }, { data: settings }] = await Promise.all([
      supabase.from("reminders").select("*").order("created_at"),
      supabase
        .from("reminder_fires")
        .select("*")
        .eq("dismissed", false)
        .gte("occurrence_at", since)
        .order("occurrence_at"),
      supabase.from("app_settings").select("reminders_globally_enabled").maybeSingle(),
    ]);
    if (!error && data) setReminders(data);
    if (fireRows) setFires(fireRows);
    if (settings) setGloballyEnabledState(settings.reminders_globally_enabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    reminders,
    fires,
    globallyEnabled,
    loading,
    refresh,

    addReminder: async (input: ReminderInput) => {
      const { error } = await supabase.from("reminders").insert({ ...input, user_id: await userId() });
      // Surfaced so a constraint violation can't close the form over nothing.
      if (error) throw error;
      await refresh();
    },
    updateReminder: async (id: string, patch: Partial<ReminderInput>) => {
      // Optimistic WITH rollback — it painted instantly but a failed write left
      // the UI lying until the trailing refresh corrected it.
      const before = reminders;
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      const { error } = await supabase.from("reminders").update(patch).eq("id", id);
      if (error) setReminders(before);
      await refresh();
    },
    deleteReminder: async (id: string) => {
      const before = reminders;
      setReminders((prev) => prev.filter((r) => r.id !== id));
      const { error } = await supabase.from("reminders").delete().eq("id", id); // fires cascade
      if (error) setReminders(before);
      await refresh();
    },

    // The master switch. Written to the DATABASE rather than localStorage
    // because the pg_cron tick has to honour it server-side — otherwise fire
    // rows accumulate while it is off and all alert at once when it returns.
    setGloballyEnabled: async (on: boolean) => {
      const before = globallyEnabled;
      setGloballyEnabledState(on);
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { user_id: await userId(), reminders_globally_enabled: on, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) setGloballyEnabledState(before);
    },

    // Record that an occurrence came due. Idempotent by (reminder_id,
    // occurrence_at): the pg_cron tick and this open browser both raise fires,
    // and whichever arrives second is a no-op rather than a duplicate alert.
    raiseFire: async (reminderId: string, occurrenceAt: Date) => {
      const { data, error } = await supabase
        .from("reminder_fires")
        .upsert(
          {
            user_id: await userId(),
            reminder_id: reminderId,
            occurrence_at: occurrenceAt.toISOString(),
            fired_at: new Date().toISOString(),
          },
          { onConflict: "reminder_id,occurrence_at", ignoreDuplicates: true },
        )
        .select("*");
      if (error) return null;
      const row = data?.[0] ?? null;
      if (row) setFires((prev) => (prev.some((f) => f.id === row.id) ? prev : [...prev, row]));
      // Advance the schedule anchor to the OCCURRENCE, not to "now", so a late
      // tick cannot drag the cadence later and later.
      await supabase
        .from("reminders")
        .update({ last_fired_at: occurrenceAt.toISOString() })
        .eq("id", reminderId);
      setReminders((prev) =>
        prev.map((r) => (r.id === reminderId ? { ...r, last_fired_at: occurrenceAt.toISOString() } : r)),
      );
      return row;
    },

    // One re-alert attempt spent. Optimistic so the cadence timer can key off
    // the new count immediately.
    recordAttempt: async (fireId: string, nextCount: number) => {
      setFires((prev) => prev.map((f) => (f.id === fireId ? { ...f, repeat_count: nextCount } : f)));
      await supabase.from("reminder_fires").update({ repeat_count: nextCount }).eq("id", fireId);
    },

    // Explicitly dismissed in the app — the alert stops for good.
    dismissFire: async (fireId: string) => {
      const before = fires;
      setFires((prev) => prev.filter((f) => f.id !== fireId));
      const { error } = await supabase.from("reminder_fires").update({ dismissed: true }).eq("id", fireId);
      if (error) setFires(before);
    },
  };
}
