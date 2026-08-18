import type { ReactNode } from "react";

export type NavKey =
  | "dashboard"
  | "tasks"
  | "weekly"
  | "jobs"
  | "reminders"
  | "finance"
  | "groceries"
  | "settings";

type NavItem = { key: NavKey; label: string; icon: ReactNode; live: boolean };

// Icon paths lifted from the v3 reference (stroke, 24x24)
const NAV: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    live: true,
    icon: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </>
    ),
  },
  {
    key: "tasks",
    label: "Tasks",
    live: true,
    icon: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
  },
  {
    key: "weekly",
    label: "Weekly Tasks",
    live: true,
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 3v3M16 3v3" />
      </>
    ),
  },
  {
    key: "jobs",
    label: "Active Jobs",
    live: true,
    icon: (
      <>
        <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
        <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
      </>
    ),
  },
  {
    key: "reminders",
    label: "Reminders",
    live: true,
    icon: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
  },
  {
    key: "finance",
    label: "Finance",
    live: false,
    icon: (
      <>
        <path d="M12 2v20M17 5.5c0-1.9-2.2-3.5-5-3.5S7 3.6 7 5.5 9.2 9 12 9s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
      </>
    ),
  },
  {
    key: "groceries",
    label: "Groceries",
    live: false,
    icon: (
      <>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </>
    ),
  },
  {
    key: "settings",
    label: "Settings",
    live: false,
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
  },
];

export const NAV_LABELS = Object.fromEntries(NAV.map((n) => [n.key, n.label])) as Record<NavKey, string>;

export function Sidebar({
  active,
  onNavigate,
  open,
  onClose,
}: {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed z-50 top-0 left-0 h-dvh w-[250px] flex flex-col px-4 py-6
          bg-[rgba(8,20,14,0.85)] lg:bg-[rgba(8,20,14,0.65)] backdrop-blur-xl
          border-r border-panel-border
          transition-transform duration-300 lg:sticky lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Primary navigation"
      >
        <div className="px-3">
          <div className="font-display font-extrabold text-xl tracking-[0.14em]">
            OL<span className="text-glow" style={{ color: "var(--color-glow)" }}>I</span>VE
          </div>
          <div className="font-data text-[10.5px] text-dim tracking-[0.08em] mt-1 mb-7">PERSONAL SYSTEM</div>
        </div>

        <ul className="flex-1 flex flex-col gap-1">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <li key={item.key}>
                <button
                  onClick={() => {
                    onNavigate(item.key);
                    onClose();
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[15px] font-medium
                    border transition duration-200 cursor-pointer text-left
                    focus-visible:outline-2 focus-visible:outline-signal
                    ${
                      isActive
                        ? "text-hud bg-signal/12 border-signal/40 shadow-[0_0_16px_rgba(63,169,104,0.22)]"
                        : "text-dim border-transparent hover:text-hud hover:border-panel-border hover:shadow-[0_0_14px_rgba(63,169,104,0.18)]"
                    }`}
                >
                  {isActive && (
                    <span className="absolute -left-4 top-2 bottom-2 w-[3px] rounded-r bg-glow shadow-[0_0_8px_var(--color-glow)]" />
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    className="w-[19px] h-[19px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </svg>
                  <span className="flex-1">{item.label}</span>
                  {!item.live && <span className="font-data text-[9px] text-dim/70 tracking-wider">SOON</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-panel-border pt-4 flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-full grid place-items-center font-display text-[13px] text-glow bg-signal/18 border border-panel-border">
            K
          </div>
          <div>
            <div className="text-[14.5px] font-semibold text-hud">Keenan</div>
            <div className="font-data text-[10px] text-dim flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-glow shadow-[0_0_6px_var(--color-glow)] pulse-live" />
              Systems nominal
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
