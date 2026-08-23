import { useCallback, useEffect, useState } from "react";
import { db } from "../lib/db";
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await db.from("active_jobs").select("*").order("updated_at", { ascending: false });
    if (!error && data) setJobs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await db.auth.getUser()).data.user!.id;

  return {
    jobs,
    loading,
    refresh,
    addJob: async (input: JobInput) => {
      await db.from("active_jobs").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateJob: async (id: string, patch: Partial<JobInput>) => {
      await db.from("active_jobs").update(patch).eq("id", id);
      await refresh();
    },
    deleteJob: async (id: string) => {
      await db.from("active_jobs").delete().eq("id", id);
      await refresh();
    },
  };
}
