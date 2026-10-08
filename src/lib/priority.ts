// Priority is a fixed three-level scale (BUILD_PLAN, 2026-10-08), 3 = most
// important. Each level has a MEANING, not just a number, and every picker
// shows it:
//   1 · low     — needs doing, no rush, whenever
//   2 · medium  — a real priority but not urgent; comes forward when the
//                 schedule gets light (see anytimeShowsInMain in sections.ts)
//   3 · urgent  — needs doing immediately; always surfaced
//
// The column is still called priority_weight. It ran 1-5 until 2026-10-08
// (5 = most important); migration 20261008000001 remapped 1,2→1 · 3→2 · 4,5→3.

export type Priority = 1 | 2 | 3;

export const PRIORITY_LEVELS: ReadonlyArray<{ value: Priority; label: string; meaning: string }> = [
  { value: 1, label: "Low", meaning: "Whenever — no rush" },
  { value: 2, label: "Medium", meaning: "Comes forward when the schedule gets light" },
  { value: 3, label: "Urgent", meaning: "Always surfaced" },
];

export const DEFAULT_PRIORITY: Priority = 2;
export const MAX_PRIORITY: Priority = 3;

// Any stored or parsed number onto the 1-3 scale. Values above 3 are treated as
// urgent (the only sensible reading of a stray legacy 4 or 5), anything below 1
// or not a number falls back to the default.
export function clampPriority(p: unknown): Priority {
  if (typeof p !== "number" || !Number.isFinite(p)) return DEFAULT_PRIORITY;
  if (p >= 3) return 3;
  if (p <= 1) return 1;
  return 2;
}

export function priorityLabel(p: number): string {
  return PRIORITY_LEVELS.find((l) => l.value === clampPriority(p))!.label;
}

// Accessible description, e.g. "Priority 3 of 3 — urgent".
export function priorityDescription(p: number): string {
  const c = clampPriority(p);
  return `Priority ${c} of ${MAX_PRIORITY} — ${priorityLabel(c).toLowerCase()}`;
}
