import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Renders children at <body>, escaping ancestor containing blocks.
//
// Why this exists: `.hud-panel` uses `backdrop-filter` (and `overflow: hidden`).
// Per CSS spec, filter/backdrop-filter/transform/perspective/will-change/contain
// make an element the containing block for `position: fixed` descendants — so a
// `fixed inset-0` overlay rendered inside a panel gets anchored to that panel and
// clipped by its overflow, appearing inline instead of as a full-screen pop-up.
// Portalling to body sidesteps it entirely.
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
