import { useEffect, useState } from "react";

// Portrait desktop monitor (CLAUDE.md third layout target). The width floor
// excludes phones, which are portrait too but far narrower. Must stay identical
// to the `tall` custom variant in src/styles/index.css.
export const PORTRAIT_MONITOR_QUERY = "(orientation: portrait) and (min-width: 700px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
