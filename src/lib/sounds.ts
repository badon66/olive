// Notification sounds for reminders (BUILD_PLAN Phase 2).
//
// The registry is the ONLY place a sound is defined. `reminders.sound_id` is
// free text in the database precisely so another file dropped into
// public/sounds/ can be wired up by adding one line here — no migration.

export type SoundDef = { id: string; label: string; file: string };

export const SOUNDS: SoundDef[] = [
  { id: "double_ding", label: "Double Ding", file: "/sounds/Double_Ding.mp3" },
  { id: "cartoon_chime", label: "Cartoon Chime", file: "/sounds/Cartoon_Chime.mp3" },
  { id: "airplane_chime", label: "Airplane Chime", file: "/sounds/Airplane_Chime.mp3" },
  { id: "service_bell", label: "Service Bell", file: "/sounds/Service_Bell.mp3" },
];

export const DEFAULT_SOUND_ID = "double_ding";

// An id written before a file was renamed/removed must not break playback — an
// unknown id falls back to the default rather than throwing or going silent.
export function soundFor(id: string | null | undefined): SoundDef {
  return SOUNDS.find((s) => s.id === id) ?? SOUNDS.find((s) => s.id === DEFAULT_SOUND_ID)!;
}

export function soundLabel(id: string | null | undefined): string {
  return soundFor(id).label;
}

// Volume is stored 0–1 and applied at playback (BUILD_PLAN). Clamped because a
// numeric column can be edited outside the slider's range.
export function clampVolume(v: number | null | undefined): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0.7;
  return Math.min(1, Math.max(0, v));
}

// One shared element per sound so rapid re-alerts don't allocate a new decoder
// each time. Reset to 0 before playing so an interrupted alert restarts cleanly.
const cache = new Map<string, HTMLAudioElement>();

export function playSound(id: string | null | undefined, volume: number | null | undefined): void {
  if (typeof Audio === "undefined") return;
  const def = soundFor(id);
  let el = cache.get(def.id);
  if (!el) {
    el = new Audio(def.file);
    el.preload = "auto";
    cache.set(def.id, el);
  }
  el.volume = clampVolume(volume);
  el.currentTime = 0;
  // Autoplay policy blocks audio until the page has been interacted with. The
  // visual alert is the real signal; sound is an enhancement, so a rejected
  // play() must never surface as an error.
  void el.play().catch(() => {});
}

export function stopSound(id: string | null | undefined): void {
  const el = cache.get(soundFor(id).id);
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}
