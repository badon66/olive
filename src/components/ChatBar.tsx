import { useState, type FormEvent } from "react";
import { sendToAssistant } from "../lib/api";

type Toast = { kind: "ok" | "error"; text: string };

export function ChatBar({ onActionDone, inline = false }: { onActionDone: () => Promise<void>; inline?: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const reply = await sendToAssistant(text);
      setMessage("");
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
          onChange={(e) => setMessage(e.target.value)}
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
    </div>
  );

  if (inline) return <div className="w-full">{content}</div>;

  return (
    <div className="fixed bottom-[calc(52px+env(safe-area-inset-bottom))] inset-x-0 z-20 px-4 pb-2">
      <div className="max-w-2xl mx-auto">{content}</div>
    </div>
  );
}
