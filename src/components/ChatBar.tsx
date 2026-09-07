import { useRef, useState, type FormEvent } from "react";
import { commitAssistant, previewAssistant, sendToAssistant, type AssistantAction, type JobContext } from "../lib/api";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "../lib/jobs";
import { SECTION_ORDER, sectionOptionLabel } from "../lib/sections";
import { Portal } from "./Portal";
import { SectionPencil } from "./SectionPencil";

type Toast = { kind: "ok" | "error"; text: string };

// A single input event that inserts a big run of text is dictation (Wispr Flow
// types the whole utterance at once) or a paste — either way it's a "voice
// capture" for preview purposes. Keystrokes insert 1-2 chars and never trip this.
const VOICE_INSERT_THRESHOLD = 20;

const ACTION_LABELS: Record<AssistantAction["type"], string> = {
  create_task: "New task",
  update_task: "Update task",
  complete_task: "Complete",
  delete_task: "Delete",
  create_category: "New section",
  create_job: "New job",
  create_reminder: "New reminder",
  update_job: "Update job",
  add_memory: "Note",
};

export function ChatBar({
  onActionDone,
  inline = false,
  taskTitleById,
  job,
  forDate,
}: {
  onActionDone: () => Promise<void>;
  inline?: boolean;
  taskTitleById?: (id: string) => string | undefined;
  // When set, every capture is scoped to this job: the assistant links created
  // tasks to it and polishes wording, and we ALWAYS preview so the user reviews
  // the rewrite (spec: job task wording goes through the preview-before-send modal).
  job?: JobContext;
  // When set, undated tasks default to this date (schedule-setup "add for tomorrow").
  forDate?: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // Voice preview-before-send: parsed actions shown in a centered modal, editable, nothing saved yet
  const [preview, setPreview] = useState<{ actions: AssistantAction[]; reply: string } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const isVoiceCapture = useRef(false);

  const onChange = (value: string) => {
    if (value.length - message.length >= VOICE_INSERT_THRESHOLD) isVoiceCapture.current = true;
    if (value.trim() === "") isVoiceCapture.current = false;
    setMessage(value);
  };

  const finish = async (reply: string) => {
    setMessage("");
    isVoiceCapture.current = false;
    setToast({ kind: "ok", text: reply });
    await onActionDone();
    setTimeout(() => setToast((t) => (t?.text === reply ? null : t)), 6000);
  };

  const fail = (err: unknown) =>
    setToast({ kind: "error", text: `Couldn't reach Olive — ${err instanceof Error ? err.message : "try again"}` });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setToast(null);
    try {
      if (isVoiceCapture.current || job) {
        // Parse only — the modal shows exactly what was understood before anything
        // saves. Job captures always preview so the polished wording is reviewable.
        setPreview(await previewAssistant(text, { job, forDate }));
        setEditingIdx(null);
      } else {
        await finish(await sendToAssistant(text, { job, forDate }));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const sendOff = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const actions = preview.actions;
      setPreview(null);
      await finish(await commitAssistant(actions));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const patchAction = (idx: number, patch: Partial<AssistantAction>) =>
    setPreview((p) => p && { ...p, actions: p.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a)) });

  const removeAction = (idx: number) =>
    setPreview((p) => p && { ...p, actions: p.actions.filter((_, i) => i !== idx) });

  const content = (
    <div className="space-y-2">
      {toast && (
        <button
          onClick={() => setToast(null)}
          aria-live="polite"
          className={`hud-panel w-full text-left p-3 text-sm whitespace-pre-line cursor-pointer ${
            toast.kind === "error" ? "!border-amber/50 text-amber" : "text-hud"
          }`}
        >
          {toast.text}
        </button>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          className={`hud-input flex-1 ${busy ? "pulse-live" : ""}`}
          placeholder={busy ? "Olive is thinking…" : job ? "Add a task to this job…" : "Tell Olive…"}
          value={message}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          aria-label="Tell Olive"
          enterKeyHint="send"
        />
        <button className="hud-button shrink-0 px-4" disabled={busy || !message.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>

      {/* Voice capture preview: what Olive understood, editable, not yet saved.
          Portalled — inside a job card this `fixed` overlay would otherwise be
          trapped by .hud-panel's backdrop-filter containing block. */}
      {preview && (
        <Portal>
        <div
          // Deliberately NO click-outside and NO Escape: this holds a parsed
          // voice capture, and an accidental dismiss discards dictated work.
          // The explicit X ("Discard") is the only way out.
          className="fixed inset-0 z-50 grid place-items-center bg-void/85 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Review what Olive understood"
        >
          <div className="hud-modal w-full max-w-xl max-h-[85dvh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-signal" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
                <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">Here's what I got</h2>
              </div>
              <button
                onClick={() => setPreview(null)}
                aria-label="Discard — nothing will be created"
                className="w-11 h-11 grid place-items-center text-dim hover:text-hud cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {preview.actions.length === 0 ? (
              <p className="text-dim text-sm">{preview.reply}</p>
            ) : (
              preview.actions.map((a, idx) => {
                const editing = editingIdx === idx;
                const matched = a.task_id ? taskTitleById?.(a.task_id) : undefined;
                return (
                  <div key={idx} className="border border-panel-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="hud-chip hud-chip-signal">{ACTION_LABELS[a.type]}</span>
                      <span className="flex-1 min-w-0 truncate font-body font-semibold">
                        {a.title ?? a.name ?? a.content ?? matched ?? (a.status ? `→ ${a.status}` : "…")}
                      </span>
                      <SectionPencil active={editing} onToggle={() => setEditingIdx(editing ? null : idx)} label="this item" />
                      <button
                        onClick={() => removeAction(idx)}
                        aria-label="Remove this item"
                        className="w-8 h-8 grid place-items-center text-dim hover:text-critical cursor-pointer rounded"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Read-back of the parsed fields */}
                    {!editing && (
                      <p className="flex flex-wrap gap-1.5">
                        {a.category_name && <span className="hud-chip">{a.category_name}</span>}
                        {a.description && <span className="hud-chip">desc</span>}
                        {a.due_date && <span className="hud-chip">due {a.due_date}</span>}
                        {a.scheduled_time && <span className="hud-chip">⏱ {a.scheduled_time}</span>}
                        {a.time_section && <span className="hud-chip">{a.time_section}</span>}
                        {typeof a.priority_weight === "number" && <span className="hud-chip">p{a.priority_weight}</span>}
                        {a.duration_minutes != null && <span className="hud-chip">{a.duration_minutes} min</span>}
                        {a.status && <span className="hud-chip hud-chip-signal">{a.status}</span>}
                        {a.notes && <span className="hud-chip">note</span>}
                        {matched && a.type !== "complete_task" && <span className="hud-chip">→ {matched}</span>}
                      </p>
                    )}

                    {editing && (
                      <div className="grid grid-cols-2 gap-2">
                        {(a.type === "create_task" || a.type === "update_task") && (
                          <>
                            <input className="hud-input col-span-2 !min-h-[38px] text-sm" value={a.title ?? ""} placeholder="title" onChange={(e) => patchAction(idx, { title: e.target.value })} />
                            <textarea className="hud-input col-span-2 text-sm min-h-[44px] resize-y" value={a.description ?? ""} placeholder="description — optional" onChange={(e) => patchAction(idx, { description: e.target.value || null })} />
                            <input className="hud-input !min-h-[38px] text-sm" value={a.category_name ?? ""} placeholder="category" onChange={(e) => patchAction(idx, { category_name: e.target.value })} />
                            <input className="hud-input !min-h-[38px] text-sm" type="date" value={a.due_date ?? ""} onChange={(e) => patchAction(idx, { due_date: e.target.value || null })} />
                            <input className="hud-input !min-h-[38px] text-sm" type="time" value={a.scheduled_time ?? ""} onChange={(e) => patchAction(idx, { scheduled_time: e.target.value || null })} />
                            <select className="hud-input !min-h-[38px] text-sm cursor-pointer" value={a.time_section ?? ""} onChange={(e) => patchAction(idx, { time_section: e.target.value || null })}>
                              <option value="" className="bg-void">any part of day</option>
                              {SECTION_ORDER.map((s) => (
                                <option key={s} value={s} className="bg-void">{sectionOptionLabel(s)}</option>
                              ))}
                            </select>
                            <select className="hud-input !min-h-[38px] text-sm cursor-pointer" value={a.priority_weight ?? 3} onChange={(e) => patchAction(idx, { priority_weight: Number(e.target.value) })}>
                              {[1, 2, 3, 4, 5].map((p) => (
                                <option key={p} value={p} className="bg-void">priority {p}</option>
                              ))}
                            </select>
                            <input className="hud-input !min-h-[38px] text-sm" type="number" min="1" value={a.duration_minutes ?? ""} placeholder="minutes" onChange={(e) => patchAction(idx, { duration_minutes: e.target.value ? Number(e.target.value) : null })} />
                          </>
                        )}
                        {a.type === "create_category" && (
                          <input className="hud-input col-span-2 !min-h-[38px] text-sm" value={a.name ?? ""} placeholder="section name" onChange={(e) => patchAction(idx, { name: e.target.value })} />
                        )}
                        {(a.type === "create_job" || a.type === "update_job") && (
                          <>
                            {a.type === "create_job" && (
                              <input className="hud-input col-span-2 !min-h-[38px] text-sm" value={a.name ?? ""} placeholder="job name" onChange={(e) => patchAction(idx, { name: e.target.value })} />
                            )}
                            <input className="hud-input !min-h-[38px] text-sm" value={a.category_name ?? ""} placeholder="header (company)" onChange={(e) => patchAction(idx, { category_name: e.target.value })} />
                            <select className="hud-input !min-h-[38px] text-sm cursor-pointer" value={a.status ?? "quoted"} onChange={(e) => patchAction(idx, { status: e.target.value })}>
                              {JOB_STATUSES.map((s) => (
                                <option key={s} value={s} className="bg-void">{JOB_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                            <input className="hud-input col-span-2 !min-h-[38px] text-sm" value={a.notes ?? ""} placeholder="notes — optional" onChange={(e) => patchAction(idx, { notes: e.target.value || null })} />
                          </>
                        )}
                        {a.type === "add_memory" && (
                          <input className="hud-input col-span-2 !min-h-[38px] text-sm" value={a.content ?? ""} placeholder="what to remember" onChange={(e) => patchAction(idx, { content: e.target.value })} />
                        )}
                        {(a.type === "complete_task" || a.type === "delete_task") && (
                          <p className="col-span-2 text-dim text-sm">{matched ? `Applies to: ${matched}` : "Applies to the matched task."}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div className="flex gap-3 pt-1">
              <button className="hud-button !border-signal-dim/40 !text-dim px-4" onClick={() => setPreview(null)}>
                Discard
              </button>
              <button
                className="hud-button hud-button-primary flex-1"
                disabled={busy || preview.actions.length === 0}
                onClick={() => void sendOff()}
              >
                {busy ? "Sending…" : "Send off"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );

  if (inline) return <div className="w-full">{content}</div>;

  return (
    <div className="fixed bottom-[env(safe-area-inset-bottom)] inset-x-0 z-20 px-4 pb-3">
      <div className="max-w-2xl mx-auto">{content}</div>
    </div>
  );
}
