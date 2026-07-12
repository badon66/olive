import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";

export type Entry = Database["public"]["Tables"]["journal_entries"]["Row"];

export function useJournal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .order("date", { ascending: false })
      .order("entry_time", { ascending: false })
      .limit(100);
    if (!error && data) setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    entries,
    loading,
    refresh,
    saveEntry: async (input: {
      date: string;
      entry_time: string;
      raw_transcript: string;
      cleaned_text: string | null;
      tags: string[];
    }) => {
      await supabase.from("journal_entries").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateEntry: async (id: string, patch: { date?: string; cleaned_text?: string | null; tags?: string[] }) => {
      await supabase.from("journal_entries").update(patch).eq("id", id);
      await refresh();
    },
    deleteEntry: async (id: string) => {
      await supabase.from("journal_entries").delete().eq("id", id);
      await refresh();
    },
  };
}
