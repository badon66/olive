import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { generateBrief } from "../lib/api";
import type { Database } from "../lib/database.types";
import { edmontonToday } from "../lib/dates";

export type BriefRow = Database["public"]["Tables"]["daily_briefs"]["Row"];
export type BriefContent = {
  today: string[];
  overdue: string[];
  upcoming: string[];
  suggested_order: string[];
  // Phase 3: jobs slice — active count + jobs whose status changed yesterday.
  // Optional because briefs generated before Phase 3 won't have it.
  jobs?: { active: number; changed: { name: string; status: string }[] };
};

export function useBrief() {
  const [brief, setBrief] = useState<BriefRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async (): Promise<BriefRow | null> => {
    const { data } = await supabase
      .from("daily_briefs")
      .select("*")
      .eq("brief_date", edmontonToday())
      .maybeSingle();
    return data ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let row = await fetchBrief();
      if (!row) {
        // No brief yet today (cron hasn't fired or app opened early) — build on demand
        await generateBrief();
        row = await fetchBrief();
      }
      setBrief(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the brief");
    } finally {
      setLoading(false);
    }
  }, [fetchBrief]);

  useEffect(() => {
    void load();
  }, [load]);

  const regenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await generateBrief();
      setBrief(await fetchBrief());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't regenerate the brief");
    } finally {
      setLoading(false);
    }
  }, [fetchBrief]);

  const saveManualOrder = useCallback(
    async (ids: string[]) => {
      if (!brief) return;
      // optimistic — reorder feels instant, then persist
      setBrief({ ...brief, manual_order: ids });
      await supabase.from("daily_briefs").update({ manual_order: ids }).eq("id", brief.id);
    },
    [brief],
  );

  return { brief, loading, error, regenerate, saveManualOrder };
}
