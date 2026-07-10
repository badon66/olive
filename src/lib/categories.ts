export const CATEGORY_LABELS = {
  personal: "Personal",
  powerplay: "PowerPlay Customs",
  alberta_premium: "Alberta Premium Coatings",
} as const;
export type Category = keyof typeof CATEGORY_LABELS;

// Per-category accent colors (dashboard sections' left-edge + dot). Keyed to the
// --color-cat-* tokens; when categories move to a table, this map moves with them.
export const CATEGORY_COLORS: Record<Category, string> = {
  personal: "var(--color-cat-personal)",
  powerplay: "var(--color-cat-powerplay)",
  alberta_premium: "var(--color-cat-alberta)",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];
