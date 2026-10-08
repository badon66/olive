import { useState, type FormEvent } from "react";

// The checklist block inside a task's (or weekly task's) popup — the ONLY place
// items are ticked (BUILD_PLAN): never inline on a row. Adding, renaming,
// removing and reordering all live here too. Every tick saves instantly through
// the store; there is no Save button for the list.
//
// Two modes share this one component:
//   • live   — rows come from the store, `onToggle` ticks them (saved at once)
//   • pending — a brand-new task that has no id yet: rows are local titles,
//              no tick boxes, and the parent form inserts them after it saves
//
// When the LAST box gets ticked, it asks — "All items done. Mark it complete?"
// Yes / Not yet — and never completes the parent on its own.

export type EditorRow = { id: string; title: string; done: boolean };

export function ChecklistEditor({
  rows,
  parentTitle,
  parentDone = false,
  onToggle,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onCompleteParent,
  completeWording = "complete",
}: {
  rows: EditorRow[];
  parentTitle: string;
  // The parent is already finished, so ticking the last box has nothing to ask.
  parentDone?: boolean;
  // Absent in pending mode (no tick boxes yet).
  onToggle?: (id: string, done: boolean) => void | Promise<void>;
  onAdd: (title: string) => void | Promise<void>;
  onRename: (id: string, title: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onMove: (index: number, dir: -1 | 1) => void | Promise<void>;
  // "Yes" in the ask-first prompt. Absent → no prompt is ever shown.
  onCompleteParent?: () => void | Promise<void>;
  // "complete" for a task, "done for today" for a weekly occurrence.
  completeWording?: string;
}) {
  const [draft, setDraft] = useState("");
  const [askComplete, setAskComplete] = useState(false);
  const live = !!onToggle;

  const toggle = (row: EditorRow) => {
    if (!onToggle) return;
    const next = !row.done;
    void onToggle(row.id, next);
    // Predict from the rows on screen: this tick makes every box ticked.
    const doneAfter = rows.filter((r) => r.done && r.id !== row.id).length + (next ? 1 : 0);
    if (next && doneAfter === rows.length && rows.length > 0 && onCompleteParent && !parentDone) {
      setAskComplete(true);
    } else if (!next) {
      setAskComplete(false);
    }
  };

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const t = draft.trim();
    if (!t) return;
    void onAdd(t);
    setDraft("");
    setAskComplete(false);
  };

  const done = rows.filter((r) => r.done).length;

  return (
    <section className="space-y-1.5" aria-label="Checklist">
      <div className="flex items-center justify-between">
        <span className="font-data text-xs text-dim uppercase tracking-wider">Checklist</span>
        {rows.length > 0 && live && (
          <span className="hud-chip hud-chip-signal" aria-label={`${done} of ${rows.length} items done`}>
            {done}/{rows.length}
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-signal-dim/15 border border-signal-dim/20 rounded-md">
          {rows.map((row, i) => (
            <li key={row.id} className="flex items-center gap-1 pr-1">
              {live ? (
                <button
                  type="button"
                  onClick={() => toggle(row)}
                  role="checkbox"
                  aria-checked={row.done}
                  aria-label={`${row.done ? "Untick" : "Tick"} ${row.title}`}
                  className="shrink-0 w-11 h-11 grid place-items-center cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <span
                    className={`w-5 h-5 rounded border grid place-items-center transition-colors duration-200 ${
                      row.done ? "border-signal bg-signal/25" : "border-signal-dim hover:border-signal"
                    }`}
                  >
                    {row.done && (
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-signal" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                </button>
              ) : (
                <span className="shrink-0 w-11 h-11 grid place-items-center text-dim/50 font-data text-xs" aria-hidden="true">
                  {i + 1}.
                </span>
              )}
              {/* Rename in place: the title is an input that saves when you leave it. */}
              <input
                defaultValue={row.title}
                key={`${row.id}-${row.title}`}
                aria-label={`Rename ${row.title}`}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== row.title) void onRename(row.id, t);
                  else if (!t) e.target.value = row.title;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className={`flex-1 min-w-0 bg-transparent font-body text-[15px] py-2 outline-none focus:text-signal ${
                  row.done ? "line-through opacity-50" : ""
                }`}
              />
              <span className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => void onMove(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${row.title} up`}
                  className="w-8 h-8 grid place-items-center text-dim enabled:hover:text-signal disabled:opacity-20 enabled:cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => void onMove(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label={`Move ${row.title} down`}
                  className="w-8 h-8 grid place-items-center text-dim enabled:hover:text-signal disabled:opacity-20 enabled:cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => void onRemove(row.id)}
                  aria-label={`Remove ${row.title}`}
                  className="w-8 h-8 grid place-items-center text-dim hover:text-critical cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-signal"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Ask first — never auto-complete silently (BUILD_PLAN). */}
      {askComplete && (
        <div
          role="alertdialog"
          aria-label="All items done"
          className="flex flex-wrap items-center gap-2 border border-signal/50 bg-signal/10 rounded-md px-3 py-2"
        >
          <p className="flex-1 min-w-[160px] font-body text-sm text-hud">
            All items done. Mark <span className="font-semibold">“{parentTitle}”</span> {completeWording}?
          </p>
          <button
            type="button"
            className="hud-button hud-button-primary !min-h-[36px] px-4"
            onClick={() => {
              setAskComplete(false);
              void onCompleteParent?.();
            }}
          >
            Yes
          </button>
          <button
            type="button"
            className="hud-button !min-h-[36px] !border-signal-dim/40 !text-dim px-3"
            onClick={() => setAskComplete(false)}
          >
            Not yet
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="hud-input !min-h-[40px] text-sm flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds an item; it must not submit the surrounding form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={rows.length === 0 ? "Add a checklist item…" : "Add another item…"}
          aria-label="New checklist item"
        />
        <button
          type="button"
          onClick={() => add()}
          disabled={!draft.trim()}
          className="hud-button !min-h-[40px] px-3"
          aria-label="Add checklist item"
        >
          Add
        </button>
      </div>
    </section>
  );
}
