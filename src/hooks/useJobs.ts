import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { readCache, writeCache } from "../lib/cache";
import type { Database } from "../lib/database.types";
import type { JobStatus } from "../lib/jobs";

export type Job = Database["public"]["Tables"]["active_jobs"]["Row"];
export type JobInput = {
  name: string;
  category_id: string | null;
  status?: JobStatus;
  notes?: string | null;
};

export type JobStore = ReturnType<typeof useJobs>;

export function useJobs() {
  // Cached last-loaded rows (lib/cache.ts): shown instantly on open, replaced
  // by the live fetch. `syncedAt` is when the data on screen was last fetched.
  const [cached] = useState(() => readCache<Job[]>("jobs"));
  const [jobs, setJobs] = useState<Job[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [syncedAt, setSyncedAt] = useState<number | null>(cached?.at ?? null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("active_jobs").select("*").order("updated_at", { ascending: false });
    if (!error && data) {
      setJobs(data);
      writeCache("jobs", data);
      setSyncedAt(Date.now());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    jobs,
    loading,
    syncedAt,
    refresh,
    addJob: async (input: JobInput) => {
      await supabase.from("active_jobs").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateJob: async (id: string, patch: Partial<JobInput>) => {
      // Optimistic: the status chips are a first-class dashboard action and
      // used to wait UPDATE + full refetch before the pressed chip highlighted.
      const before = jobs;
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
      const { error } = await supabase.from("active_jobs").update(patch).eq("id", id);
      if (error) setJobs(before);
      await refresh();
    },
    deleteJob: async (id: string) => {
      const before = jobs;
      setJobs((prev) => prev.filter((j) => j.id !== id));
      const { error } = await supabase.from("active_jobs").delete().eq("id", id);
      if (error) setJobs(before);
      await refresh();
    },
  };
}
