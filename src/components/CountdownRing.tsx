import { useEffect, useRef } from "react";
import { countdownLabel } from "../lib/reminders";

// Live countdown ring (BUILD_PLAN): a clock-style circle that visibly depletes
// in real time — "genuinely alive/ticking", not a number that changes on
// refresh.
//
// PERFORMANCE (CLAUDE.md): the per-frame update is written straight to the DOM
// through refs inside a requestAnimationFrame loop. React never re-renders for
// it — a setState per frame across several rings would dominate the main
// thread for a decorative element. `stroke-dashoffset` is a paint-only SVG
// property (it triggers neither layout nor reflow), which is why it is the
// standard approach for this rather than animating width/height.
//
// The loop stops entirely while the tab is hidden, and degrades to a 1 Hz tick
// when the user prefers reduced motion.
export function CountdownRing({
  target,
  cycle,
  size = 46,
  stroke = 3,
  showLabel = true,
}: {
  // The instant being counted down to. null = nothing scheduled.
  target: Date | null;
  // Seconds in one full sweep of the ring (the gap between occurrences).
  cycle: number | null;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const ringRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetMs = target ? target.getTime() : null;

  useEffect(() => {
    if (targetMs === null || !cycle || cycle <= 0) return;

    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastText = "";

    const paint = () => {
      const remaining = Math.max(0, (targetMs - Date.now()) / 1000);
      // 1 = full circle (a whole cycle to go), 0 = empty (firing now).
      const fraction = Math.min(1, remaining / cycle);
      const ring = ringRef.current;
      if (ring) {
        ring.style.strokeDashoffset = String(circumference * (1 - fraction));
        // Runs warm as the moment approaches — amber inside the last minute.
        ring.style.stroke = remaining <= 60 ? "var(--color-amber)" : "var(--color-glow)";
      }
      const text = countdownLabel(remaining);
      if (labelRef.current && text !== lastText) {
        labelRef.current.textContent = text;
        lastText = text;
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paint();

    if (reduced) {
      timer = setInterval(paint, 1000);
      return () => clearInterval(timer);
    }

    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // A background tab gets no frames anyway; cancelling makes that explicit
    // and keeps the ring from burning a frame budget it cannot use.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [targetMs, cycle, circumference]);

  if (targetMs === null || !cycle || cycle <= 0) {
    return (
      <span className="font-data text-[10px] text-dim/60 shrink-0" aria-hidden="true">
        —
      </span>
    );
  }

  return (
    <span className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Start the sweep at 12 o'clock like a real clock face.
        style={{ transform: "rotate(-90deg)" }}
        role="img"
        aria-label="Time remaining until this reminder fires"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-panel-border)"
          strokeWidth={stroke}
        />
        <circle
          ref={ringRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-glow)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={0}
          style={{ filter: "drop-shadow(0 0 3px rgba(63,169,104,0.55))" }}
        />
      </svg>
      {showLabel && (
        <span
          ref={labelRef}
          className="absolute font-data text-[9px] text-dim leading-none tabular-nums"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
