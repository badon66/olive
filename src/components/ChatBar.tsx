import { useRef, useState, type FormEvent } from "react";
import { sendToAssistant } from "../lib/api";

type Toast = { kind: "ok" | "error"; text: string };

// A single input event that inserts a big run of text is dictation (Wispr Flow
// types the whole utterance at once) or a paste — either way it's a "voice
// capture" for preview purposes. Keystrokes insert 1-2 chars and never trip this.
const VOICE_INSERT_THRESHOLD = 20;

export function ChatBar({ onActionDone, inline = false }: { onActionDone: () => Promise<void>; inline?: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const isVoiceCapture = useRef(false);

  const onChange = (value: string) => {
    if (value.length - message.length >= VOICE_INSERT_THRESHOLD) isVoiceCapture.current = true;
    if (value.trim() === "") isVoiceCapture.current = false;
    setMessage(value);
  };

  const doSend = async (text: string) => {
    setBusy(true);
    setToast(null);
    try {
      const reply = await sendToAssistant(text);
      setMessage("");
      isVoiceCapture.current = false;
      setToast({ kind: "ok", text: reply });
      await onActionDone();
      setTimeout(() => setToast((t) => (t?.text === reply ? null : t)), 6000);
    } catch (err) {
      // Keep the input so a network blip doesn't eat the dictation
      setToast({ kind: "error", text: `Couldn't reach Olive — ${err instanceof Error ? err.message : "try again"}` });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    // Voice captures get a preview-before-send modal; typed text sends directly
    if (isVoiceCapture.current) setVoicePreview(text);
    else void doSend(text);
  };

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
          placeholder={busy ? "Olive is thinking…" : "Tell Olive…"}
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

      {/* Voice-capture preview: centered modal with backdrop (v3 spec) —
          appears only after dictation, never for typed text */}
      {voicePreview !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
          onClick={() => setVoicePreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Review voice capture"
        >
          <div className="hud-panel w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-signal" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
              </svg>
              <h2 className="font-display text-signal text-sm tracking-[0.2em] uppercase">Voice capture</h2>
            </div>
            <textarea
              className="hud-input resize-y"
              rows={4}
              value={voicePreview}
              onChange={(e) => setVoicePreview(e.target.value)}
              aria-label="Captured text — edit before sending"
            />
            <div className="flex gap-3">
              <button
                className="hud-button !border-signal-dim/40 !text-dim px-4"
                onClick={() => setVoicePreview(null)}
              >
                Cancel
              </button>
              <button
                className="hud-button hud-button-primary flex-1"
                disabled={!voicePreview.trim()}
                onClick={() => {
                  const text = voicePreview.trim();
                  setVoicePreview(null);
                  void doSend(text);
                }}
              >
                Send to Olive
              </button>
            </div>
          </div>
        </div>
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
