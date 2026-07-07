import { useState } from "react";
import { useJournal, type Entry } from "../hooks/useJournal";
import { cleanJournal } from "../lib/api";
import { edmontonToday, formatDue } from "../lib/dates";

type Preview = { cleaned_text: string; tags: string[] };

export function JournalView({ compact = false }: { compact?: boolean }) {
  const { entries, loading, saveEntry, updateEntry, deleteEntry } = useJournal();
  const [raw, setRaw] = useState("");
  const [date, setDate] = useState(edmontonToday());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runClean = async () => {
    if (!raw.trim() || busy) return;
    setBusy(true);
    setCleanError(null);
    try {
      setPreview(await cleanJournal(raw.trim()));
      setShowOriginal(false);
    } catch (e) {
      setCleanError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setBusy(false);
    }
  };

  const save = async (cleaned: Preview | null) => {
    setBusy(true);
    await saveEntry({
      date,
      raw_transcript: raw.trim(),
      cleaned_text: cleaned?.cleaned_text ?? null,
      tags: cleaned?.tags ?? [],
    });
    setRaw("");
    setPreview(null);
    setCleanError(null);
    setDate(edmontonToday());
    setBusy(false);
  };

  if (loading) return <p className="text-dim pulse-live">Loading journal…</p>;

  const today = edmontonToday();
  const visible = compact && !expanded ? entries.slice(0, 5) : entries;

  return (
    <div className="space-y-4">
      {/* Composer */}
      <section className={compact ? "" : "hud-panel p-4"}>
        {!preview ? (
          <div className="space-y-2">
            <textarea
              className="hud-input resize-y"
              rows={compact ? 3 : 4}
              placeholder="Paste or dictate your entry…"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-label="Journal entry"
            />
            <div className="flex items-center gap-2">
              <input
                className="hud-input !w-auto"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Entry date"
              />
              <button
                className={`hud-button flex-1 ${busy ? "pulse-live" : ""}`}
                disabled={busy || !raw.trim()}
                onClick={() => void runClean()}
              >
                {busy ? "Olive is cleaning…" : "Clean up & preview"}
              </button>
            </div>
            {cleanError && (
              <div className="hud-panel !border-amber/50 p-3 space-y-2">
                <p className="text-amber text-sm">Cleaning unavailable — {cleanError}</p>
                <button className="hud-button w-full" disabled={busy} onClick={() => void save(null)}>
                  Save raw anyway
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-data text-xs text-dim uppercase tracking-wider">Cleaned preview</p>
            <p className="font-body whitespace-pre-line">{preview.cleaned_text}</p>
            {preview.tags.length > 0 && (
              <p className="flex gap-1.5 flex-wrap">
                {preview.tags.map((t) => (
                  <span key={t} className="hud-chip">{t}</span>
                ))}
              </p>
            )}
            <button
              className="font-data text-xs text-dim underline underline-offset-4 cursor-pointer"
              onClick={() => setShowOriginal(!showOriginal)}
            >
              {showOriginal ? "hide original" : "show original"}
            </button>
            {showOriginal && <p className="text-dim text-sm whitespace-pre-line">{raw}</p>}
            <div className="flex gap-2">
              <button className="hud-button flex-1" disabled={busy} onClick={() => void save(preview)}>
                Save both
              </button>
              <button
                className="hud-button !border-signal-dim/40 !text-dim px-4"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Discard cleaning
              </button>
            </div>
          </div>
        )}
      </section>

      {/* List */}
      {entries.length === 0 ? (
        <p className="text-dim text-sm">No entries yet.</p>
      ) : (
        <section className={compact ? "" : "hud-panel p-2"}>
          <div className="divide-y divide-signal-dim/15">
            {visible.map((e) => (
              <button
                key={e.id}
                onClick={() => setOpenEntry(e)}
                className="w-full text-left flex items-center gap-3 px-2 py-2.5 cursor-pointer hover:bg-signal/5 focus-visible:outline-2 focus-visible:outline-signal rounded"
              >
                <span className="font-data text-xs text-signal-dim shrink-0 w-14">{formatDue(e.date, today)}</span>
                <span className="flex-1 min-w-0 truncate font-body text-sm">
                  {(e.cleaned_text ?? e.raw_transcript).slice(0, 80)}
                </span>
                {e.cleaned_text === null && <span className="hud-chip hud-chip-amber shrink-0">raw</span>}
                {e.tags.slice(0, 2).map((t) => (
                  <span key={t} className="hud-chip shrink-0 hidden sm:inline-flex">{t}</span>
                ))}
              </button>
            ))}
          </div>
          {compact && entries.length > 5 && (
            <button
              className="w-full font-data text-xs text-dim py-2 cursor-pointer hover:text-signal"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "show fewer" : `older entries (${entries.length - 5})`}
            </button>
          )}
        </section>
      )}

      {openEntry && (
        <EntryDetail
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onSave={async (patch) => {
            await updateEntry(openEntry.id, patch);
            setOpenEntry(null);
          }}
          onDelete={async () => {
            await deleteEntry(openEntry.id);
            setOpenEntry(null);
          }}
        />
      )}
    </div>
  );
}

function EntryDetail({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (patch: { date?: string; cleaned_text?: string | null; tags?: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [text, setText] = useState(entry.cleaned_text ?? "");
  const [tags, setTags] = useState(entry.tags.join(", "));
  const [date, setDate] = useState(entry.date);
  const [showRaw, setShowRaw] = useState(entry.cleaned_text === null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cleanError, setCleanError] = useState<string | null>(null);

  const recleanNow = async () => {
    setBusy(true);
    setCleanError(null);
    try {
      const result = await cleanJournal(entry.raw_transcript);
      setText(result.cleaned_text);
      if (!tags.trim()) setTags(result.tags.join(", "));
    } catch (e) {
      setCleanError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end sm:place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Journal entry"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="hud-panel w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <input
            className="hud-input !w-auto !min-h-[38px]"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Entry date"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">
            {entry.cleaned_text === null && !text ? "No cleaned version yet" : "Cleaned entry (editable)"}
          </span>
          <textarea
            className="hud-input resize-y"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="No cleaned text — edit here or run cleaning"
          />
        </label>

        {entry.cleaned_text === null && (
          <button className={`hud-button w-full ${busy ? "pulse-live" : ""}`} disabled={busy} onClick={() => void recleanNow()}>
            {busy ? "Olive is cleaning…" : "Clean again"}
          </button>
        )}
        {cleanError && <p className="text-amber text-sm">Cleaning unavailable — {cleanError}</p>}

        <div>
          <button
            className="font-data text-xs text-dim underline underline-offset-4 cursor-pointer"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? "hide original dictation" : "show original dictation"}
          </button>
          {showRaw && (
            <p className="text-dim text-sm whitespace-pre-line mt-2 border-l border-signal-dim/30 pl-3">
              {entry.raw_transcript}
            </p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="font-data text-xs text-dim uppercase tracking-wider">Tags (comma-separated)</span>
          <input className="hud-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>

        <div className="flex gap-3">
          <button
            className="hud-button !border-critical/60 !text-critical hover:!bg-critical/10 px-4"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button
            className="hud-button flex-1"
            disabled={busy}
            onClick={() =>
              void onSave({
                date,
                cleaned_text: text.trim() || null,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
          >
            Save
          </button>
        </div>

        {confirmDelete && (
          <div className="hud-panel !border-critical/40 p-3 space-y-2">
            <p className="text-sm">Delete this entry for good?</p>
            <div className="flex gap-2">
              <button className="hud-button flex-1" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="hud-button flex-1 !border-critical/60 !text-critical hover:!bg-critical/10"
                onClick={() => void onDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
