import { useEffect } from "react";

// Escape closes the dialog. Every modal in the app takes this — it was
// previously implemented only in TaskActionPopup, leaving the other seven
// dialogs Escape-deaf, which read as broken keyboard support rather than a
// deliberate difference.
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
