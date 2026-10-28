import { useEffect, useRef, useState } from "react";

// Refetch whenever the app comes back to the foreground (BUILD_PLAN "Speed and
// freshness"): switching back to the tab, reopening the installed app from the
// home screen (iOS restores it from memory — a 'pageshow' / visibility change,
// not a fresh load), or the network returning. Throttled so a visibility
// change and a focus event arriving together trigger one refresh, not two.
const MIN_GAP_MS = 2_000;

export function useForegroundRefresh(refresh: () => void | Promise<unknown>): { online: boolean } {
  const latest = useRef(refresh);
  latest.current = refresh;
  const last = useRef(0);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const run = () => {
      const now = Date.now();
      if (now - last.current < MIN_GAP_MS) return;
      last.current = now;
      void latest.current();
    };
    const onVisible = () => {
      if (!document.hidden) run();
    };
    const onOnline = () => {
      setOnline(true);
      run();
    };
    const onOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { online };
}
