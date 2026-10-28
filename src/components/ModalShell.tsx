import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { usePhoneLayout } from "../hooks/usePhoneLayout";
import { Portal } from "./Portal";
import { useEscape } from "./useEscape";

// THE popup container. Every dialog in the app (task/weekly/job/reminder/
// category forms, the quick-actions popup, the schedule setup, the voice
// preview) renders inside this, so the presentation is decided in ONE place:
//   • desktop / portrait monitor — a centred modal with a blurred backdrop,
//     exactly as before;
//   • phone (BUILD_PLAN "Bottom sheets instead of centered modals") — a sheet
//     that slides up from the bottom, solid background, drag handle, dismissed
//     by dragging down or tapping outside, safe-area padding at the bottom.
//
// Portal is load-bearing: `.hud-panel` sets backdrop-filter, which makes a
// panel the containing block for position:fixed descendants — a modal rendered
// inside a panel was anchored to it and clipped. Rendering at <body> escapes that.

const DISMISS_DRAG_PX = 90;

export function ModalShell({
  label,
  onClose,
  children,
  size = "md",
  // false = only an explicit control closes it (the voice preview protects
  // dictated content from an accidental tap outside or swipe).
  dismissable = true,
  className = "",
  align = "center",
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
  // Desktop only: "top" pins the dialog near the top of the screen instead of
  // centring it (the schedule setup form). The phone always uses a sheet.
  align?: "center" | "top";
  // Padding/spacing for the content box; the shell supplies the surface.
  className?: string;
}) {
  const phone = usePhoneLayout();
  useEscape(() => {
    if (dismissable) onClose();
  });

  // Drag-down-to-dismiss (phone). The gesture starts on the sheet itself; a
  // drag that begins while the content is scrolled down is left to the
  // browser so the list still scrolls normally.
  const [dragY, setDragY] = useState(0);
  const dragging = useRef<{ startY: number; pointerId: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!phone || !dismissable || e.pointerType === "mouse") return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;
    dragging.current = { startY: e.clientY, pointerId: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (dy > 0) setDragY(dy);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragging.current = null;
    if (dragY > DISMISS_DRAG_PX) onClose();
    setDragY(0);
  };

  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-xl" : "sm:max-w-md";

  if (!phone) {
    return (
      <Portal>
        <div
          className={`fixed inset-0 z-50 grid bg-void/85 backdrop-blur-sm p-4 ${
            align === "top" ? "justify-items-center items-start pt-[7vh] overflow-y-auto" : "place-items-center"
          }`}
          onClick={dismissable ? onClose : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className={`hud-modal w-full ${width} ${align === "top" ? "" : "max-h-[90dvh] overflow-y-auto"} ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end bg-void/75"
        onClick={dismissable ? onClose : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div
          className="hud-modal w-full max-h-[92dvh] flex flex-col rounded-t-2xl rounded-b-none !border-x-0 !border-b-0 motion-safe:animate-sheet-in"
          style={{
            // transform only (CLAUDE.md motion rules) — follows the finger, then
            // springs back or leaves.
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragging.current ? "none" : "transform 180ms var(--ease-out-soft)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Grab handle — also the obvious place to start a drag. */}
          <div className="shrink-0 pt-2.5 pb-1 grid place-items-center touch-none" aria-hidden="true">
            <span className="w-10 h-1.5 rounded-full bg-dim/40" />
          </div>
          <div ref={scrollRef} className={`min-h-0 overflow-y-auto overscroll-contain ${className}`}>
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}
