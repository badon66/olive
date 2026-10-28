import { describe, expect, it } from "vitest";
import { agoLabel, clearCache, isStale, readCache, STALE_AFTER_MS, writeCache } from "./cache";

// A minimal in-memory Storage, since the tests run in node.
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("cache — last-loaded rows come back instantly, with their age", () => {
  it("round-trips data with the time it was written", () => {
    const s = memStorage();
    writeCache("tasks", [{ id: "a" }], s, 1000);
    expect(readCache("tasks", s)).toEqual({ data: [{ id: "a" }], at: 1000 });
  });

  it("a missing, corrupt or shapeless entry reads as nothing (a normal first load)", () => {
    const s = memStorage();
    expect(readCache("tasks", s)).toBeNull();
    s.setItem("olive:cache:tasks", "{not json");
    expect(readCache("tasks", s)).toBeNull();
    s.setItem("olive:cache:tasks", JSON.stringify({ rows: [] }));
    expect(readCache("tasks", s)).toBeNull();
  });

  it("no storage at all is tolerated", () => {
    expect(readCache("tasks", null)).toBeNull();
    expect(() => writeCache("tasks", [], null)).not.toThrow();
  });

  it("clearCache removes only Olive's entries", () => {
    const s = memStorage();
    writeCache("tasks", [], s, 1);
    s.setItem("other", "keep");
    clearCache(s);
    expect(readCache("tasks", s)).toBeNull();
    expect(s.getItem("other")).toBe("keep");
  });

  it("stale after three minutes, always when offline, never before the first load", () => {
    const now = 10_000_000;
    expect(isStale(now - STALE_AFTER_MS + 1, now)).toBe(false);
    expect(isStale(now - STALE_AFTER_MS - 1, now)).toBe(true);
    expect(isStale(now, now, true)).toBe(true);
    expect(isStale(null, now)).toBe(false);
  });

  it("describes the age in plain words", () => {
    const now = 1_000_000_000;
    expect(agoLabel(now - 10_000, now)).toBe("just now");
    expect(agoLabel(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(agoLabel(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(agoLabel(now - 5 * 3_600_000, now)).toBe("5 hours ago");
    expect(agoLabel(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });
});
