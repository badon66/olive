// Skeleton loading rows (CLAUDE.md: "Loading states use a skeleton … never a
// blank flash"). Until now no skeleton existed anywhere: the tab views replaced
// whole pages with one line of text, and the dashboard panels were WORSE — with
// no loading gate at all they rendered their empty states ("Nothing scheduled",
// "No active jobs", "Nothing here") while data was still in flight, asserting
// for ~half a second on every cold load that the user had nothing to do.
export function SkeletonRows({ count = 3, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <div className="pulse-live space-y-2 py-1" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 ${compact ? "py-0.5" : "py-1.5"}`}>
          <span className="w-5 h-5 rounded-full bg-signal/[0.08] shrink-0" />
          <span
            className="h-3.5 rounded bg-signal/[0.08]"
            // Vary the widths so it reads as text lines, not a barcode.
            style={{ width: `${[68, 45, 58, 38, 62][i % 5]}%` }}
          />
        </div>
      ))}
    </div>
  );
}
