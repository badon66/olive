export const CATEGORY_LABELS = {
  personal: "Personal",
  powerplay: "PowerPlay",
  alberta_premium: "Alberta Premium",
} as const;
export type Category = keyof typeof CATEGORY_LABELS;
