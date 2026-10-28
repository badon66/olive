import { useCallback, useEffect, useRef, useState } from "react";

// Push-to-talk dictation for the phone's capture sheet, using the browser's own
// speech recognition (Safari on iPhone and Chrome on Android expose it as
// webkitSpeechRecognition). Nothing is always-listening: it records only while
// the mic button is held on, then stops after a pause (CLAUDE.md: no
// wake-word voice in v1). Where the browser has no recognizer — or refuses it,
// as some installed home-screen apps do — the sheet says so and the keyboard's
// own dictation mic is the fallback. The transcript goes through the same
// parser and preview-before-send flow as everything else.

type Recognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onText: (text: string, isFinal: boolean) => void) {
  const supported = recognizerCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const latest = useRef(onText);
  latest.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor) {
      setError("This browser has no dictation — use the keyboard's mic.");
      return;
    }
    setError(null);
    try {
      const r = new Ctor();
      r.lang = "en-CA";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        let text = "";
        let final = false;
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
          final = e.results[i].isFinal;
        }
        latest.current(text.trim(), final);
      };
      r.onerror = (e) => {
        setError(
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "Microphone access is off for Olive — allow it, or use the keyboard's mic."
            : e.error === "no-speech"
              ? "Didn't catch that — tap the mic and try again."
              : "Dictation isn't available here — use the keyboard's mic.",
        );
        setListening(false);
      };
      r.onend = () => setListening(false);
      rec.current = r;
      r.start();
      setListening(true);
    } catch {
      setError("Dictation isn't available here — use the keyboard's mic.");
      setListening(false);
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
