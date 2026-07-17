// Customize-mode layout model. Section keys are stable ids; category sections
// are dynamic ("cat:<uuid>"). Positions are react-grid-layout units on a
// 12-column grid; only x/y/w (and an optional custom label) persist — heights
// are measured from real content at render time.

export type SavedSection = { x: number; y: number; w: number; label?: string };
export type SavedLayout = Record<string, SavedSection>;

export const FIXED_SECTIONS = [
  "weekly",
  "finance",
  "schedule",
  "upcoming",
  "jobs",
  "journal",
  "priorities",
] as const;

export const DEFAULT_LABELS: Record<string, string> = {
  weekly: "Weekly Tasks",
  finance: "Finance",
  schedule: "Today's Schedule",
  upcoming: "Upcoming Days",
  jobs: "Active Jobs",
  journal: "Journal",
  priorities: "Priorities",
};

export const catKey = (categoryId: string) => `cat:${categoryId}`;

// BUILD_PLAN's explicit two-column split:
// LEFT (x0 w6): Weekly Tasks → category panels → Finance
// RIGHT (x6 w6): Today's Schedule → Upcoming Days → Active Jobs → Journal
// Full width below both: Priorities. y values are coarse ranks — the grid's
// vertical compactor snugs everything up using measured heights.
export function defaultLayout(categoryIds: string[]): SavedLayout {
  const out: SavedLayout = {};
  let y = 0;
  out.weekly = { x: 0, y: y++, w: 6 };
  for (const id of categoryIds) out[catKey(id)] = { x: 0, y: y++, w: 6 };
  out.finance = { x: 0, y: y++, w: 6 };

  out.schedule = { x: 6, y: 0, w: 6 };
  out.upcoming = { x: 6, y: 1, w: 6 };
  out.jobs = { x: 6, y: 2, w: 6 };
  out.journal = { x: 6, y: 3, w: 6 };

  out.priorities = { x: 0, y: 1000, w: 12 };
  return out;
}

// Saved layout wins; anything new since the save (e.g. a category created
// yesterday) drops in at its default spot. Stale keys (deleted categories)
// are ignored by the renderer, so no cleanup pass is needed here.
export function mergeLayout(saved: SavedLayout, categoryIds: string[]): SavedLayout {
  const base = defaultLayout(categoryIds);
  const out: SavedLayout = { ...base };
  for (const [key, sec] of Object.entries(saved)) {
    if (key in base) out[key] = { ...base[key], ...sec };
  }
  return out;
}
