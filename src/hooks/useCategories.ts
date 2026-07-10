import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export function useCategories() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("categories").select("*").order("created_at");
    if (!error && data) setCategories(data);
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
