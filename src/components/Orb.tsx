import { useEffect, useRef } from "react";

// Particle orb ported from the Claude Design reference (Olive Dashboard v2),
// recolored to the project's signal-green token. Static single frame when the
// user prefers reduced motion.
export function Orb({ size = 420 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = size;
    const H = size;
    const cx = W / 2;
    const cy = H / 2;
    const scale = size / 420;
    const N = 200;
    const parts = Array.from({ length: N }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: (45 + Math.pow(Math.random(), 0.6) * 85) * scale,
      speed: (0.0004 + Math.random() * 0.0012) * (Math.random() < 0.5 ? 1 : -1),
      size: (0.6 + Math.random() * 1.6) * scale,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.01 + Math.random() * 0.03,
    }));

    let t = 0;
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, W, H);
      const pulse = 0.88 + 0.12 * Math.sin(t * 0.012);

      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 145 * scale * pulse);
      halo.addColorStop(0, `rgba(46,255,181,${0.24 * pulse})`);
      halo.addColorStop(0.35, `rgba(46,255,181,${0.08 * pulse})`);
      halo.addColorStop(1, "rgba(46,255,181,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 36 * scale * pulse);
      core.addColorStop(0, `rgba(222,255,243,${0.9 * pulse})`);
      core.addColorStop(0.5, `rgba(46,255,181,${0.45 * pulse})`);
      core.addColorStop(1, "rgba(46,255,181,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, 36 * scale * pulse, 0, Math.PI * 2);
      ctx.fill();

      for (const p of parts) {
        p.theta += p.speed;
        p.tw += p.twSpeed;
        const wob = 5 * scale * Math.sin(t * 0.004 + p.phi * 3);
        const R = (p.r + wob) * pulse;
        const x = cx + R * Math.sin(p.phi) * Math.cos(p.theta);
        const y = cy + R * Math.cos(p.phi) * 0.85 + R * 0.12 * Math.sin(p.theta * 0.5);
        const depth = (Math.sin(p.phi) * Math.sin(p.theta) + 1) / 2;
        const a = (0.13 + 0.5 * depth) * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.fillStyle = `rgba(46,255,181,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.6 + 0.6 * depth), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} aria-hidden="true" />;
}
