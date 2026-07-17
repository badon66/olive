import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { mergeLayout, type SavedLayout, type SavedSection } from "../lib/dashboardLayout";

// Loads the per-user dashboard arrangement and saves it on every drag-stop /
// resize-stop / rename. One row per user (unique user_id).
export function useDashboardLayout(categoryIds: string[]) {
  const [saved, setSaved] = useState<SavedLayout>({});
  const [loaded, setLoaded] = useState(false);
  const savedRef = useRef<SavedLayout>({});

  useEffect(() => {
    let alive = true;
    void supabase
      .from("dashboard_layouts")
      .select("layout")
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const layout = (data?.layout ?? {}) as SavedLayout;
        savedRef.current = layout;
        setSaved(layout);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(async (next: SavedLayout) => {
    savedRef.current = next;
    setSaved(next);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    await supabase
      .from("dashboard_layouts")
      .upsert(
        { user_id: user.user.id, layout: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }, []);

  // Positions/widths for every current section (defaults filled in for new ones)
  const layout = mergeLayout(saved, categoryIds);

  const savePositions = useCallback(
    (positions: { key: string; x: number; y: number; w: number }[]) => {
      const next: SavedLayout = { ...savedRef.current };
      for (const p of positions) {
        next[p.key] = { ...(next[p.key] ?? { x: p.x, y: p.y, w: p.w }), x: p.x, y: p.y, w: p.w };
      }
      void persist(next);
    },
    [persist],
  );

  const saveLabel = useCallback(
    (key: string, label: string, defaultLabel: string) => {
      const current: SavedSection = savedRef.current[key] ?? { ...(mergeLayout(savedRef.current, categoryIds)[key] ?? { x: 0, y: 0, w: 6 }) };
      const next: SavedLayout = { ...savedRef.current };
      const trimmed = label.trim();
      if (trimmed === "" || trimmed === defaultLabel) {
        // Back to default: drop the override but keep position
        next[key] = { x: current.x, y: current.y, w: current.w };
      } else {
        next[key] = { ...current, label: trimmed };
      }
      void persist(next);
    },
    [persist, categoryIds],
  );

  return { layout, loaded, savePositions, saveLabel };
}
