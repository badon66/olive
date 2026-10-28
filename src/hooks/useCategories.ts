import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { readCache, writeCache } from "../lib/cache";
import type { Database } from "../lib/database.types";

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export function useCategories() {
  // Cached last-loaded rows (lib/cache.ts): shown instantly on open, replaced
  // by the live fetch. `syncedAt` is when the data on screen was last fetched.
  const [cached] = useState(() => readCache<CategoryRow[]>("categories"));
  const [categories, setCategories] = useState<CategoryRow[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [syncedAt, setSyncedAt] = useState<number | null>(cached?.at ?? null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("categories").select("*").order("created_at");
    if (!error && data) {
      setCategories(data);
      writeCache("categories", data);
      setSyncedAt(Date.now());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    categories,
    byId,
    loading,
    syncedAt,
    refresh,
    addCategory: async (name: string, color: string) => {
      await supabase.from("categories").insert({ name, color, user_id: await userId() });
      await refresh();
    },
    updateCategory: async (id: string, patch: { name?: string; color?: string }) => {
      await supabase.from("categories").update(patch).eq("id", id);
      await refresh();
    },
  };
}

export type CategoryStore = ReturnType<typeof useCategories>;
