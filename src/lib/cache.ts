// Local cache for the data hooks (BUILD_PLAN "Speed and freshness"): opening
// the app shows the last-loaded rows instantly, then the real fetch replaces
// them. Each store writes its rows here after every successful load and reads
// them back as its initial state. Plain JSON in localStorage, one key per
// store, with the time it was written so the UI can say "Updated 3 min ago".
//
// This is a convenience, never the truth: a missing or unreadable cache simply
// means a normal first load with skeletons.

const PREFIX = "olive:cache:";

export type Cached<T> = { data: T; at: number };

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function readCache<T>(key: string, storage: Storage | null = storageOrNull()): Cached<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached<T>;
    if (!parsed || typeof parsed.at !== "number" || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T, storage: Storage | null = storageOrNull(), now = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(PREFIX + key, JSON.stringify({ data, at: now }));
  } catch {
    // Quota or private mode — the live data is still on screen.
  }
}

export function clearCache(storage: Storage | null = storageOrNull()): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
}

// Data older than this (or any data while offline) is announced as stale.
export const STALE_AFTER_MS = 3 * 60_000;

export function isStale(syncedAt: number | null, now: number, offline = false): boolean {
  if (offline) return true;
  if (syncedAt === null) return false; // nothing loaded yet — a skeleton, not a stale note
  return now - syncedAt > STALE_AFTER_MS;
}

// "Updated just now" / "Updated 3 min ago" / "Updated 2 hours ago".
export function agoLabel(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
