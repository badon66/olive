import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { addDays, edmontonToday } from "../lib/dates";
import { normalizeOverridePatch, overrideIsEmpty, type OverridePatch } from "../lib/weekly";

export type WeeklyTask = Database["public"]["Tables"]["weekly_tasks"]["Row"];
export type WeeklyCheckin = Database["public"]["Tables"]["weekly_task_checkins"]["Row"];
export type WeeklyDayOverride = Database["public"]["Tables"]["weekly_task_day_overrides"]["Row"];
export type WeeklyTaskInput = {
  name: string;
  recurrence_mode: "count" | "fixed_days";
  target_per_week: number | null; // count mode
  scheduled_days: number[] | null; // fixed_days mode, 0=Monday..6=Sunday
  time_section?: WeeklyTask["time_section"];
  // Indefinite pause (BUILD_PLAN) — hides the task everywhere but its own tab.
  paused?: boolean;
};

export function useWeeklyTasks() {
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([]);
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([]);
  const [dayOverrides, setDayOverrides] = useState<WeeklyDayOverride[]>([]);
  // False until the overrides table answers — see refresh().
  const [overridesReady, setOverridesReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // ~4 weeks of history is plenty for the current-week cubes
    const since = addDays(edmontonToday(), -28);
    const [w, c, o] = await Promise.all([
      // Manual order first; never-nudged rows (sort_order null) keep creation order
      supabase
        .from("weekly_tasks")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at"),
      supabase.from("weekly_task_checkins").select("*").gte("date", since),
      // Per-day name/section/time tweaks. Read the near future too — the
      // schedule can be stepped forward a week, and an override set for a
      // coming day has to travel with it.
      supabase.from("weekly_task_day_overrides").select("*").gte("date", since),
    ]);
    if (!w.error && w.data) setWeeklyTasks(w.data);
    if (!c.error && c.data) setCheckins(c.data);
    // Tolerated rather than required: if weekly_task_day_overrides has not been
    // migrated yet the query 404s, and the app must still work — every
    // occurrence simply falls back to its own name, section and no clock time.
    // `overridesReady` then gates the UI, so the per-day editor stays hidden
    // rather than appearing and failing on save. It lights up on its own once
    // the migration lands; no redeploy needed.
    if (!o.error && o.data) {
      setDayOverrides(o.data);
      setOverridesReady(true);
    } else if (o.error) {
      setOverridesReady(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  // Optimistic check-off: the cube flips instantly, then the row is written and
  // the real state reconciled by refresh().
  const upsertStatus = async (weeklyTaskId: string, date: string, status: "planned" | "completed" | "skipped") => {
    setCheckins((prev) => {
      const hit = prev.find((c) => c.weekly_task_id === weeklyTaskId && c.date === date);
      if (hit) return prev.map((c) => (c === hit ? { ...c, status } : c));
      return [...prev, { id: `optimistic-${weeklyTaskId}-${date}`, weekly_task_id: weeklyTaskId, date, status } as WeeklyCheckin];
    });
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

  const removeDayOverride = async (weeklyTaskId: string, date: string) => {
    const before = dayOverrides;
    setDayOverrides((prev) => prev.filter((o) => !(o.weekly_task_id === weeklyTaskId && o.date === date)));
    const { error } = await supabase
      .from("weekly_task_day_overrides")
      .delete()
      .eq("weekly_task_id", weeklyTaskId)
      .eq("date", date);
    if (error) setDayOverrides(before);
    await refresh();
  };

  // One-day-only tweak to a single occurrence (rename / move part of day / pin a
  // clock time). Writes nothing to weekly_tasks, so the recurring pattern — and
  // every other day — is untouched. A patch that overrides nothing deletes the
  // row rather than storing a meaningless one.
  const writeDayOverride = async (weeklyTaskId: string, date: string, patch: OverridePatch) => {
    const next = normalizeOverridePatch(patch);
    if (overrideIsEmpty(next)) return removeDayOverride(weeklyTaskId, date);

    const before = dayOverrides;
    setDayOverrides((prev) => {
      const rest = prev.filter((o) => !(o.weekly_task_id === weeklyTaskId && o.date === date));
      return [...rest, { id: `optimistic-${weeklyTaskId}-${date}`, weekly_task_id: weeklyTaskId, date, ...next } as WeeklyDayOverride];
    });
    const { error } = await supabase
      .from("weekly_task_day_overrides")
      .upsert({ weekly_task_id: weeklyTaskId, date, ...next, user_id: await userId() }, { onConflict: "weekly_task_id,date" });
    if (error) setDayOverrides(before);
    await refresh();
  };

  return {
    weeklyTasks,
    checkins,
    dayOverrides,
    overridesReady,
    loading,
    refresh,
    setDayOverride: writeDayOverride,
    clearDayOverride: removeDayOverride,
    addWeeklyTask: async (input: WeeklyTaskInput) => {
      await supabase.from("weekly_tasks").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateWeeklyTask: async (id: string, patch: Partial<WeeklyTaskInput>) => {
      // Optimistic: cube-weekday toggles and drag-to-section paint immediately
      // (a dropped weekly item used to snap back until the refetch landed).
      const before = weeklyTasks;
      setWeeklyTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("weekly_tasks").update(patch).eq("id", id);
      if (error) setWeeklyTasks(before);
      await refresh();
    },
    // Ordering for weekly occurrences shown inside Today's Schedule / Active
    // Tasks. Not used by the Weekly Tasks tab, which has no arrows (BUILD_PLAN).
    saveWeeklyOrder: async (updates: { id: string; sort_order: number }[]) => {
      if (updates.length === 0) return;
      const before = weeklyTasks;
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setWeeklyTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t)));
      const results = await Promise.all(
        updates.map((u) => supabase.from("weekly_tasks").update({ sort_order: u.sort_order }).eq("id", u.id)),
      );
      if (results.some((r) => r.error)) setWeeklyTasks(before);
      await refresh();
    },
    deleteWeeklyTask: async (id: string) => {
      await supabase.from("weekly_tasks").delete().eq("id", id); // checkins cascade
      await refresh();
    },
    // "Skip today" (BUILD_PLAN): explicitly not doing this occurrence. Distinct
    // from missing it — it doesn't count against the weekly target and leaves
    // the recurring pattern completely alone.
    skipDay: (id: string, date: string) => upsertStatus(id, date, "skipped"),
    // Drag onto a day block (or tap a future cube): lights just that cube
    planDay: (id: string, date: string) => upsertStatus(id, date, "planned"),
    completeDay: (id: string, date: string) => upsertStatus(id, date, "completed"),
    // Unplanning removes the row (fixed_days cubes fall back to their virtual planned state).
    // Optimistic: the cube clears instantly; rollback on error.
    unplanDay: async (id: string, date: string) => {
      const before = checkins;
      setCheckins((prev) => prev.filter((c) => !(c.weekly_task_id === id && c.date === date)));
      const { error } = await supabase
        .from("weekly_task_checkins")
        .delete()
        .eq("weekly_task_id", id)
        .eq("date", date);
      if (error) setCheckins(before);
      await refresh();
    },
    // Un-completing: count-mode keeps the cube planned, fixed_days reverts to
    // virtual planned. Optimistic to match completeDay — un-checking used to
    // wait a full round-trip while checking was instant, a felt asymmetry on
    // the very same cube.
    uncompleteDay: async (task: WeeklyTask, date: string) => {
      const before = checkins;
      if (task.recurrence_mode === "count") {
        setCheckins((prev) =>
          prev.map((c) =>
            c.weekly_task_id === task.id && c.date === date ? { ...c, status: "planned" as const } : c,
          ),
        );
        const { error } = await supabase
          .from("weekly_task_checkins")
          .update({ status: "planned" })
          .eq("weekly_task_id", task.id)
          .eq("date", date);
        if (error) setCheckins(before);
      } else {
        setCheckins((prev) => prev.filter((c) => !(c.weekly_task_id === task.id && c.date === date)));
        const { error } = await supabase
          .from("weekly_task_checkins")
          .delete()
          .eq("weekly_task_id", task.id)
          .eq("date", date);
        if (error) setCheckins(before);
      }
      await refresh();
    },
  };
}

export type WeeklyStore = ReturnType<typeof useWeeklyTasks>;
