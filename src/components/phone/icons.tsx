// Stroke icons for the phone shell (24×24, currentColor). Kept together so the
// tab bar, rows and sheets share one visual weight.

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconNow = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

export const IconToday = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <path d="M3 9h18M8 3v3M16 3v3M7.5 13h4M7.5 16.5h7" />
  </svg>
);

export const IconBell = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconFinance = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M12 2v20M17 5.5c0-1.9-2.2-3.5-5-3.5S7 3.6 7 5.5 9.2 9 12 9s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
  </svg>
);

export const IconMore = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </svg>
);

export const IconMic = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </svg>
);

export const IconCheck = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg {...base} strokeWidth={3} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconChevron = ({ dir = "right", className = "w-4 h-4" }: { dir?: "left" | "right" | "down" | "up"; className?: string }) => (
  <svg {...base} strokeWidth={2.2} className={className}>
    <path
      d={
        dir === "left"
          ? "m15 18-6-6 6-6"
          : dir === "right"
            ? "m9 18 6-6-6-6"
            : dir === "down"
              ? "m6 9 6 6 6-6"
              : "m18 15-6-6-6 6"
      }
    />
  </svg>
);

export const IconPlus = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconWeekly = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 3v3M16 3v3" />
    <path d="M7 14h2M11 14h2M15 14h2" />
  </svg>
);

export const IconUpcoming = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="2.5" y="5" width="5.5" height="14" rx="1.2" />
    <rect x="9.25" y="5" width="5.5" height="14" rx="1.2" />
    <rect x="16" y="5" width="5.5" height="14" rx="1.2" />
  </svg>
);

export const IconJobs = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
    <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
  </svg>
);

export const IconList = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const IconSettings = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
