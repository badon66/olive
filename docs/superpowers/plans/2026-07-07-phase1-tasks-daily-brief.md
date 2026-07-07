# Olive Phase 1 — Tasks + Daily Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working PWA where Keenan can create/edit/complete/delete tasks by natural language (typed or dictated) or manual forms, and sees a pre-generated daily brief (today / overdue / next 7 days + suggested order) every morning at 7:00 America/Edmonton.

**Architecture:** React + Vite + Tailwind v4 PWA talking to a new Supabase project ("Olive", ca-central-1, $0/mo confirmed). All LLM calls happen in Supabase Edge Functions (Deno): `assistant` (NL → Claude tool-use → zod-validated actions → Postgres) and `daily-brief` (deterministic brief builder, no LLM, stored in `daily_briefs`). pg_cron + pg_net fire `daily-brief` at 13:00 & 14:00 UTC; the function itself checks "is it 7am in Edmonton?" so DST is handled inside the function, not the cron expression. Frontend reads via supabase-js with RLS; brief falls back to on-demand generation if today's row is missing.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), vite-plugin-pwa, supabase-js v2, Vitest (frontend logic tests), Supabase Edge Functions (Deno, zod, Anthropic Messages API via fetch, model `claude-sonnet-4-6`), pg_cron + pg_net + Vault (cron secret), fonts self-hosted via @fontsource (Orbitron / Rajdhani / IBM Plex Mono).

## Global Constraints (from CLAUDE.md — apply to every task)

- v1 is read-and-remind only. NO real-world actions. No writes to any Google Sheet. Plaid/Google are not in this phase at all.
- All secrets (Anthropic API key, cron secret) live in Supabase Edge Function secrets / Vault / gitignored `.env`. Never in frontend code, never committed.
- All LLM calls server-side in Edge Functions. The React app never calls the Anthropic API.
- LLM model: `claude-sonnet-4-6`.
- Timezone: America/Edmonton for ALL scheduling logic. Cron runs in UTC — convert explicitly (handled by dual-hour cron + in-function local-hour guard).
- TypeScript everywhere, including Edge Functions.
- Schema changes via migration files in `supabase/migrations/` only (applied to the cloud project via Supabase MCP `apply_migration` with the identical SQL; the files in the repo are the source of truth).
- NL capture pattern: user text → Edge Function → Claude with a JSON schema → validate with zod → write to Postgres → plain confirmation string back.
- Graceful degradation: if today's brief is missing/stale, show last-generated time; generate on demand.
- Single user, email auth, RLS on all tables.
- Design: "techy Jarvis" holographic HUD. Tokens (verbatim): void `#050B0A`, panel `rgba(12,32,26,0.55)` + backdrop-blur, signal-green `#2EFFB5`, signal-green-dim `#1D8F6B`, text `#EAFBF3`, text-dim `#7FA89A`, amber `#FFB454` (caution only), red `#FF5C5C` (critical only). Fonts: Orbitron (display), Rajdhani (body), IBM Plex Mono (data). Motifs: glass panels, thin glowing borders, corner-bracket framing, ring/arc gauges, subtle grid/scan texture, radial glow behind key numbers, gentle pulse on live data. Visual references: `design/Olive's Holographic Dashboard-handoff/olive-s-holographic-dashboard/project/Olive Dashboard v2.dc.html` (and v1 beside it).
- UI-heavy work MUST start by running the UI/UX Pro Max skill with the prompt in CLAUDE.md § Design direction (Task 6, Step 1).
- Category display names: `personal` → "Personal", `powerplay` → "PowerPlay", `alberta_premium` → "Alberta Premium".
- After scaffolding, fill CLAUDE.md § Commands and keep it current (Task 12).
- Phase 1 ONLY. Stop after Task 12. No habits, no journal, no jobs, no integrations.

## File Structure

```
C:\Apps\Olive\
├── .env                          # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored)
├── .gitignore
├── index.html
├── package.json
├── vite.config.ts                # vite + tailwind + pwa + vitest config
├── public/
│   └── icon.svg                  # PWA icon source (+ generated PNGs)
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # app shell: view switch (brief | tasks) + ChatBar
│   ├── styles/
│   │   └── index.css             # tailwind v4 @theme tokens + HUD base classes
│   ├── lib/
│   │   ├── supabase.ts           # supabase-js client (env-driven)
│   │   ├── database.types.ts     # generated from live schema
│   │   ├── dates.ts              # Edmonton-local date helpers (pure)
│   │   ├── dates.test.ts
│   │   ├── ranking.ts            # suggested-order scoring (pure)
│   │   ├── ranking.test.ts
│   │   ├── categories.ts         # enum ↔ display-name map
│   │   └── api.ts                # invoke edge functions (assistant, daily-brief)
│   ├── hooks/
│   │   ├── useTasks.ts           # fetch/mutate tasks + realtime-ish refresh
│   │   └── useBrief.ts           # fetch today's brief, on-demand generate, save manual order
│   └── components/
│       ├── AuthGate.tsx          # sign-in screen (no signup UI)
│       ├── ChatBar.tsx           # persistent NL capture input + confirmation toasts
│       ├── BriefView.tsx         # today/overdue/next-7 + suggested order + reorder
│       ├── TaskList.tsx          # grouped by category
│       ├── TaskCard.tsx
│       └── TaskForm.tsx          # manual add/edit modal
├── supabase/
│   ├── config.toml               # created by `supabase init` (or minimal hand-written)
│   ├── migrations/
│   │   ├── 20260707000001_phase1_schema.sql
│   │   └── 20260707000002_phase1_cron.sql
│   └── functions/
│       ├── _shared/
│       │   ├── actions.ts        # zod schemas + JSON schema for Claude tool
│       │   ├── anthropic.ts      # fetch wrapper for Messages API
│       │   ├── brief.ts          # pure brief-builder (sections + ranking, mirrors src/lib logic)
│       │   └── supabase.ts       # user-scoped + service-role client helpers
│       ├── assistant/index.ts
│       └── daily-brief/index.ts
└── docs/ , design/ , CLAUDE.md   # existing
```

Decisions locked in during planning (approved by user before execution):
1. **New Supabase project** "Olive" in org WorkBase (`cosoqmpvfoqugpclmsfj`), region `ca-central-1`, cost $0/month (confirmed via get_cost).
2. **Migration workflow:** files in `supabase/migrations/` are canonical; applied to cloud via MCP `apply_migration` (no Docker/local stack required on this Windows machine).
3. **DST-proof scheduling:** cron `0 13,14 * * *` UTC → function exits unless Edmonton local hour == 7; unique `(user_id, brief_date)` makes it idempotent. On-demand fallback from the app.
4. **Chat can also store memories** ("remember that …" → `memories` row) since the table is specced in Phase 1 — flagged to user at approval.
5. **Account creation:** Keenan creates his one account in the Supabase dashboard (Auth → Add user) so his password never passes through Claude; signups stay disabled in the app UI (no signup form) and are turned off in dashboard after.
6. **Anthropic API key:** provided by Keenan at Task 8 (set as Edge Function secret `ANTHROPIC_API_KEY` in dashboard or via CLI — never committed).
7. **Manual reorder** = up/down buttons per row (reliable on iPhone Safari; drag-and-drop is YAGNI), persisted to `daily_briefs.manual_order`.

---

### Task 1: Git init + Vite/React/Tailwind/PWA scaffold

**Files:**
- Create: `.gitignore`, `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`, `public/icon.svg`
- Test: `npm run dev` renders a placeholder; `npm run test` runs (0 tests ok); `npm run build` passes.

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `preview`; Tailwind v4 theme tokens under names `void, panel, signal, signal-dim, hud, dim, amber, critical`; fonts `font-display`, `font-body`, `font-data`.

- [ ] **Step 1: Init git and scaffold**

```powershell
git init
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite @supabase/supabase-js zod
npm install -D vite-plugin-pwa vitest @vite-pwa/assets-generator
npm install @fontsource-variable/orbitron @fontsource/rajdhani/500.css-check
```

Note: fontsource installs are `@fontsource-variable/orbitron`, `@fontsource/rajdhani` (weights 400/500/600/700 imported individually), `@fontsource/ibm-plex-mono` (400/500). If `npm create vite` balks at a non-empty dir, scaffold into `web-tmp` and move files up (keep existing `docs/`, `design/`, `CLAUDE.md`).

- [ ] **Step 2: `.gitignore`**

```
node_modules
dist
.env
.env.*
dev-dist
supabase/.temp
```

- [ ] **Step 3: `vite.config.ts`** (vite + tailwind + pwa + vitest in one file)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Olive",
        short_name: "Olive",
        description: "Personal assistant — tasks, daily brief",
        theme_color: "#050B0A",
        background_color: "#050B0A",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 4: `src/styles/index.css`** — Tailwind v4 theme with the exact CLAUDE.md tokens

```css
@import "tailwindcss";
@import "@fontsource-variable/orbitron";
@import "@fontsource/rajdhani/400.css";
@import "@fontsource/rajdhani/500.css";
@import "@fontsource/rajdhani/600.css";
@import "@fontsource/rajdhani/700.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";

@theme {
  --color-void: #050b0a;
  --color-panel: rgba(12, 32, 26, 0.55);
  --color-signal: #2effb5;
  --color-signal-dim: #1d8f6b;
  --color-hud: #eafbf3;
  --color-dim: #7fa89a;
  --color-amber: #ffb454;
  --color-critical: #ff5c5c;
  --font-display: "Orbitron Variable", sans-serif;
  --font-body: "Rajdhani", sans-serif;
  --font-data: "IBM Plex Mono", monospace;
}

body {
  @apply bg-void text-hud font-body;
}
```

(HUD panel/bracket/glow utility classes are added in Task 6 by the design-system step — this task only establishes tokens.)

- [ ] **Step 5: Placeholder `App.tsx`, generate PWA icons, verify**

`public/icon.svg` — simple signal-green ring on void (final art may be refined in Task 6):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#050B0A"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#2EFFB5" stroke-width="22"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#1D8F6B" stroke-width="6" stroke-dasharray="40 24"/>
  <circle cx="256" cy="256" r="56" fill="#2EFFB5"/>
</svg>
```

```powershell
npx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg
npm run dev    # placeholder renders on void background with token fonts
npm run build  # passes
```

- [ ] **Step 6: Commit** — `git add -A; git commit -m "chore: scaffold Vite+React+Tailwind v4 PWA with Olive HUD tokens"`

---

### Task 2: Supabase project + auth account

**Files:**
- Create: `.env`, `supabase/config.toml` (minimal), `src/lib/supabase.ts`

**Interfaces:**
- Produces: live Supabase project ref `<OLIVE_REF>`; `supabase` client export from `src/lib/supabase.ts`; env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Create project via Supabase MCP** — `create_project` (name "Olive", org `cosoqmpvfoqugpclmsfj`, region `ca-central-1`) after `confirm_cost` ($0/mo). Record the project ref. Wait for ACTIVE_HEALTHY (`get_project`).

- [ ] **Step 2: `.env`** (gitignored) — `get_project_url` + `get_publishable_keys` via MCP:

```
VITE_SUPABASE_URL=https://<OLIVE_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

- [ ] **Step 3: `src/lib/supabase.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

(`database.types.ts` arrives in Task 3; use a temporary `export type Database = any` placeholder file so this compiles, replaced in Task 3.)

- [ ] **Step 4: USER ACTION — create the account.** Pause and ask Keenan to: Supabase Dashboard → Authentication → Add user → email `keenanhuber99@gmail.com` + a password he chooses (auto-confirm), then Authentication → Sign In / Up → disable "Allow new users to sign up". Wait for his confirmation.

- [ ] **Step 5: Commit** — config files only (`.env` must NOT appear in `git status`).

---

### Task 3: Migration 1 — schema + RLS + generated types

**Files:**
- Create: `supabase/migrations/20260707000001_phase1_schema.sql`
- Create: `src/lib/database.types.ts` (generated)

**Interfaces:**
- Produces: tables `tasks`, `memories`, `daily_briefs` exactly as below; enums `task_category`, `task_status`. All later tasks use these column names verbatim.

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 1 schema: tasks, memories, daily_briefs + RLS
create type task_category as enum ('personal', 'powerplay', 'alberta_premium');
create type task_status as enum ('open', 'completed');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category task_category not null default 'personal',
  due_date date,
  status task_status not null default 'open',
  priority_weight int not null default 3 check (priority_weight between 1 and 5),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  date date,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  content jsonb not null,          -- { today: uuid[], overdue: uuid[], upcoming: uuid[], suggested_order: uuid[] }
  manual_order uuid[],             -- user's reorder for the day; wins over suggested_order when present
  generated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create index tasks_user_status_due_idx on tasks (user_id, status, due_date);
create index memories_user_idx on memories (user_id, created_at desc);

alter table tasks enable row level security;
alter table memories enable row level security;
alter table daily_briefs enable row level security;

create policy "own tasks" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own memories" on memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own briefs" on daily_briefs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply via MCP `apply_migration`** (name `phase1_schema`, identical SQL). Verify with `list_tables` — three tables present, RLS enabled.

- [ ] **Step 3: Generate types** — MCP `generate_typescript_types` → save output to `src/lib/database.types.ts` (replacing the placeholder). `npm run build` passes.

- [ ] **Step 4: Run `get_advisors` (security)** — expect no RLS warnings; fix anything reported before continuing.

- [ ] **Step 5: Commit** — `git commit -m "feat: phase 1 schema (tasks, memories, daily_briefs) with RLS"`

---

### Task 4: Pure logic — Edmonton dates + suggested-order ranking (TDD)

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/dates.test.ts`, `src/lib/ranking.ts`, `src/lib/ranking.test.ts`, `src/lib/categories.ts`

**Interfaces:**
- Produces:
  - `edmontonToday(now?: Date): string` → `"YYYY-MM-DD"` in America/Edmonton
  - `daysBetween(fromISO: string, toISO: string): number` (calendar days, to − from)
  - `formatDue(dateISO: string, todayISO: string): string` → "Today" / "Tomorrow" / "3d overdue" / "Jul 12"
  - `scoreTask(t: {due_date: string | null; priority_weight: number}, todayISO: string): number`
  - `suggestedOrder<T extends {id: string; due_date: string | null; priority_weight: number; created_at: string}>(tasks: T[], todayISO: string): string[]` (task ids, best-first)
  - `CATEGORY_LABELS: Record<'personal'|'powerplay'|'alberta_premium', string>`

- [ ] **Step 1: Write failing tests — `dates.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { daysBetween, edmontonToday, formatDue } from "./dates";

describe("edmontonToday", () => {
  it("converts UTC evening to same Edmonton date in summer (MDT, UTC-6)", () => {
    expect(edmontonToday(new Date("2026-07-07T13:00:00Z"))).toBe("2026-07-07");
  });
  it("rolls back a date when UTC is past midnight but Edmonton is not", () => {
    expect(edmontonToday(new Date("2026-07-08T03:00:00Z"))).toBe("2026-07-07");
  });
  it("handles winter (MST, UTC-7)", () => {
    expect(edmontonToday(new Date("2026-01-15T06:59:00Z"))).toBe("2026-01-14");
  });
});

describe("daysBetween", () => {
  it("is positive for future dates", () => expect(daysBetween("2026-07-07", "2026-07-10")).toBe(3));
  it("is negative for past dates", () => expect(daysBetween("2026-07-07", "2026-07-05")).toBe(-2));
  it("is zero for same day", () => expect(daysBetween("2026-07-07", "2026-07-07")).toBe(0));
});

describe("formatDue", () => {
  it("Today / Tomorrow / overdue / date", () => {
    expect(formatDue("2026-07-07", "2026-07-07")).toBe("Today");
    expect(formatDue("2026-07-08", "2026-07-07")).toBe("Tomorrow");
    expect(formatDue("2026-07-04", "2026-07-07")).toBe("3d overdue");
    expect(formatDue("2026-07-12", "2026-07-07")).toBe("Jul 12");
  });
});
```

`ranking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreTask, suggestedOrder } from "./ranking";

const t = (id: string, due: string | null, w = 3, created = "2026-07-01T00:00:00Z") =>
  ({ id, due_date: due, priority_weight: w, created_at: created });
const TODAY = "2026-07-07";

describe("scoreTask", () => {
  it("overdue beats due-today; due-today beats future; future beats undated", () => {
    const overdue = scoreTask(t("a", "2026-07-05"), TODAY);
    const today = scoreTask(t("b", "2026-07-07"), TODAY);
    const future = scoreTask(t("c", "2026-07-09"), TODAY);
    const undated = scoreTask(t("d", null), TODAY);
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(future);
    expect(future).toBeGreaterThan(undated);
  });
  it("priority breaks ties within a band", () => {
    expect(scoreTask(t("a", "2026-07-07", 5), TODAY)).toBeGreaterThan(scoreTask(t("b", "2026-07-07", 1), TODAY));
  });
  it("nearer future dates score higher", () => {
    expect(scoreTask(t("a", "2026-07-08"), TODAY)).toBeGreaterThan(scoreTask(t("b", "2026-07-12"), TODAY));
  });
});

describe("suggestedOrder", () => {
  it("orders by score desc, created_at asc as tiebreak", () => {
    const list = [
      t("future", "2026-07-10"),
      t("overdue", "2026-07-01"),
      t("today-hi", "2026-07-07", 5),
      t("today-lo", "2026-07-07", 2),
    ];
    expect(suggestedOrder(list, TODAY)).toEqual(["overdue", "today-hi", "today-lo", "future"]);
  });
});
```

- [ ] **Step 2: Run `npm run test`** — expect FAIL (modules don't exist).

- [ ] **Step 3: Implement `dates.ts`**

```ts
// All app date logic is Edmonton-local. Postgres `date` columns are plain
// YYYY-MM-DD strings; never construct `new Date("YYYY-MM-DD")` for display
// math (it parses as UTC midnight) — compare strings or use Date.UTC.

export function edmontonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now); // en-CA → YYYY-MM-DD
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function formatDue(dateISO: string, todayISO: string): string {
  const d = daysBetween(todayISO, dateISO);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0) return `${-d}d overdue`;
  const [y, m, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, day)));
}
```

`ranking.ts`:

```ts
import { daysBetween } from "./dates";

// Score bands keep classes strictly separated regardless of priority (1-5):
// overdue 100+, due today 80+, future ≤ 55, undated ≤ 5.
export function scoreTask(t: { due_date: string | null; priority_weight: number }, todayISO: string): number {
  if (!t.due_date) return t.priority_weight;
  const d = daysBetween(todayISO, t.due_date);
  if (d < 0) return 100 + Math.min(-d, 30) + t.priority_weight;
  if (d === 0) return 80 + t.priority_weight;
  return Math.max(0, 50 - d * 5) + t.priority_weight;
}

export function suggestedOrder<T extends { id: string; due_date: string | null; priority_weight: number; created_at: string }>(
  tasks: T[], todayISO: string,
): string[] {
  return [...tasks]
    .sort((a, b) => scoreTask(b, todayISO) - scoreTask(a, todayISO) || a.created_at.localeCompare(b.created_at))
    .map((t) => t.id);
}
```

`categories.ts`:

```ts
export const CATEGORY_LABELS = {
  personal: "Personal",
  powerplay: "PowerPlay",
  alberta_premium: "Alberta Premium",
} as const;
export type Category = keyof typeof CATEGORY_LABELS;
```

- [ ] **Step 4: `npm run test`** — all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: Edmonton date helpers and suggested-order ranking (tested)"`

---

### Task 5: Auth gate + task data hook

**Files:**
- Create: `src/components/AuthGate.tsx`, `src/hooks/useTasks.ts`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `supabase` client (Task 2), `Database` types (Task 3).
- Produces:
  - `<AuthGate>{children}</AuthGate>` — renders sign-in screen until a session exists.
  - `useTasks()` → `{ tasks: Task[]; loading: boolean; refresh(): Promise<void>; addTask(input): Promise<void>; updateTask(id, patch): Promise<void>; completeTask(id): Promise<void>; reopenTask(id): Promise<void>; deleteTask(id): Promise<void> }` where `Task = Database["public"]["Tables"]["tasks"]["Row"]` and `input = { title: string; category: Category; due_date: string | null; priority_weight: number }`.

- [ ] **Step 1: `AuthGate.tsx`** — email + password sign-in only (no signup UI):

```tsx
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (session) return <>{children}</>;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={signIn} className="hud-panel w-full max-w-sm p-6 space-y-4">
        <h1 className="font-display text-signal text-xl tracking-widest">OLIVE</h1>
        <input className="hud-input" type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className="hud-input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-critical text-sm">{error}</p>}
        <button className="hud-button w-full" disabled={busy}>{busy ? "…" : "Sign in"}</button>
      </form>
    </div>
  );
}
```

(`hud-panel` / `hud-input` / `hud-button` classes are defined in Task 6's design pass; until then they render unstyled — acceptable inside this task.)

- [ ] **Step 2: `useTasks.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import type { Category } from "../lib/categories";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInput = { title: string; category: Category; due_date: string | null; priority_weight: number };

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority_weight", { ascending: false });
    if (!error && data) setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    tasks, loading, refresh,
    addTask: async (input: TaskInput) => {
      await supabase.from("tasks").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateTask: async (id: string, patch: Partial<TaskInput>) => {
      await supabase.from("tasks").update(patch).eq("id", id);
      await refresh();
    },
    completeTask: async (id: string) => {
      await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
      await refresh();
    },
    reopenTask: async (id: string) => {
      await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", id);
      await refresh();
    },
    deleteTask: async (id: string) => {
      await supabase.from("tasks").delete().eq("id", id);
      await refresh();
    },
  };
}
```

- [ ] **Step 3: Wire `App.tsx`** — `<AuthGate>` wrapping a two-view shell (`brief` | `tasks` state, bottom tab bar placeholder, empty views). `npm run build` passes; manual check: sign in with the account from Task 2 Step 4 works against the live project.

- [ ] **Step 4: Commit** — `git commit -m "feat: auth gate and task data hook"`

---

### Task 6: Design system pass + app shell (UI/UX Pro Max)

**Files:**
- Modify: `src/styles/index.css` (HUD utility classes), `src/App.tsx` (styled shell/nav)
- Reference: `design/Olive's Holographic Dashboard-handoff/olive-s-holographic-dashboard/project/Olive Dashboard v2.dc.html`

**Interfaces:**
- Produces: CSS classes used by all later UI tasks: `hud-panel` (glass + thin glowing border + corner brackets), `hud-input`, `hud-button`, `hud-chip`, `hud-ring` (arc gauge), `text-glow`, `pulse-live`; a styled app shell with header ("OLIVE" + date in font-data) and bottom nav (Brief / Tasks) sized mobile-first.

- [ ] **Step 1: Run the UI/UX Pro Max skill** with the exact prompt from CLAUDE.md § Design direction ("Create a personal assistant PWA dashboard with a glassy holographic HUD interface… dark sci-fi Iron-Man-style holographic green theme."). Constrain its output to the token values already in `@theme` (Global Constraints) — tokens are fixed; the skill contributes component styling, spacing, effects, and states.

- [ ] **Step 2: Implement the HUD utility classes** in `index.css` per the skill's output — must include at minimum: glassmorphic panel (`background: var(--color-panel); backdrop-filter: blur(…)`), 1px `--color-signal-dim` borders with corner-bracket pseudo-elements, radial glow behind display numbers, subtle background grid/scan texture on `body`, gentle `pulse-live` keyframe animation, visible focus states, WCAG-readable text contrast on all tokens.

- [ ] **Step 3: Style the app shell** — header + bottom tab nav (Brief / Tasks), safe-area padding for iPhone (`env(safe-area-inset-bottom)`), viewport check at 390px and 1280px widths.

- [ ] **Step 4: Visual check against the reference HTML** — open the reference in a browser side by side with `npm run dev`; match tone (void bg, green glow, Orbitron headers, mono data), not pixel-exact layout.

- [ ] **Step 5: Commit** — `git commit -m "feat: holographic HUD design system and app shell"`

---

### Task 7: Task list UI + manual forms

**Files:**
- Create: `src/components/TaskList.tsx`, `src/components/TaskCard.tsx`, `src/components/TaskForm.tsx`
- Modify: `src/App.tsx` (mount TaskList in tasks view)

**Interfaces:**
- Consumes: `useTasks()` (Task 5), `CATEGORY_LABELS` (Task 4), `formatDue`/`edmontonToday` (Task 4), HUD classes (Task 6).
- Produces: full manual CRUD path (spec: "voice is not the only path").

- [ ] **Step 1: `TaskList.tsx`** — groups open tasks by category in `CATEGORY_LABELS` order, each group a `hud-panel` with Orbitron header + count chip; completed tasks in a collapsed "Completed" section (last 20); "+ Add task" button opens `TaskForm`.

- [ ] **Step 2: `TaskCard.tsx`** — title (font-body 600), due chip via `formatDue` (amber when overdue — caution semantics per tokens), priority as 1–5 tick marks (font-data), tap-and-hold-free actions: complete (ring checkbox), edit (opens `TaskForm` prefilled), delete (single confirm). Completed cards show dimmed with reopen.

- [ ] **Step 3: `TaskForm.tsx`** — modal `hud-panel` form: title (required), category select (3 options), due date (native `<input type="date">`), priority 1–5 segmented control (default 3). Submits via `addTask`/`updateTask`. Validation: non-empty title only — everything else has defaults.

- [ ] **Step 4: Manual verification** — create/edit/complete/reopen/delete a task in each category on the live project; confirm rows in Supabase (`execute_sql` SELECT) match; refresh survives.

- [ ] **Step 5: Commit** — `git commit -m "feat: task list grouped by category with manual CRUD forms"`

---

### Task 8: Edge Function `assistant` — NL task capture

**Files:**
- Create: `supabase/functions/_shared/actions.ts`, `supabase/functions/_shared/anthropic.ts`, `supabase/functions/_shared/supabase.ts`, `supabase/functions/assistant/index.ts`
- Create: `src/lib/api.ts`

**Interfaces:**
- Consumes: schema (Task 3). Secret `ANTHROPIC_API_KEY` (USER ACTION below).
- Produces: `POST /functions/v1/assistant` body `{ message: string }`, auth `Bearer <user JWT>`, returns `{ reply: string }`. Frontend helper `sendToAssistant(message: string): Promise<string>`.

- [ ] **Step 1: USER ACTION — Anthropic API key.** Pause and ask Keenan to add secret `ANTHROPIC_API_KEY` in Supabase Dashboard → Edge Functions → Secrets (or paste it to me privately and I set it via CLI). Do not proceed until set. Never write it to any file in the repo.

- [ ] **Step 2: `_shared/actions.ts`** — zod schemas + matching JSON Schema for the Claude tool:

```ts
import { z } from "npm:zod@3";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const category = z.enum(["personal", "powerplay", "alberta_premium"]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), title: z.string().min(1), category: category.default("personal"),
    due_date: isoDate.nullable().default(null), priority_weight: z.number().int().min(1).max(5).default(3) }),
  z.object({ type: z.literal("update_task"), task_id: z.string().uuid(), title: z.string().min(1).optional(),
    category: category.optional(), due_date: isoDate.nullable().optional(), priority_weight: z.number().int().min(1).max(5).optional() }),
  z.object({ type: z.literal("complete_task"), task_id: z.string().uuid() }),
  z.object({ type: z.literal("delete_task"), task_id: z.string().uuid() }),
  z.object({ type: z.literal("add_memory"), content: z.string().min(1), date: isoDate.nullable().default(null),
    tags: z.array(z.string()).default([]) }),
]);
export const PlanSchema = z.object({ actions: z.array(ActionSchema).max(10), reply: z.string().min(1) });
export type Plan = z.infer<typeof PlanSchema>;

// JSON Schema handed to Claude as the tool's input_schema (kept in sync with the zod above).
export const APPLY_ACTIONS_TOOL = {
  name: "apply_actions",
  description: "Apply the user's requested task/memory changes and compose a short plain reply.",
  input_schema: {
    type: "object",
    required: ["actions", "reply"],
    properties: {
      reply: { type: "string", description: "Short plain-language response. If no action fits, explain or ask." },
      actions: {
        type: "array", maxItems: 10,
        items: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["create_task", "update_task", "complete_task", "delete_task", "add_memory"] },
            title: { type: "string" },
            category: { type: "string", enum: ["personal", "powerplay", "alberta_premium"] },
            due_date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
            priority_weight: { type: "integer", minimum: 1, maximum: 5 },
            task_id: { type: "string", description: "uuid of an existing task from the OPEN TASKS list" },
            content: { type: "string" }, date: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 3: `_shared/anthropic.ts`** — plain fetch, no SDK:

```ts
export async function callClaude(opts: { system: string; user: string; tool: unknown; toolName: string }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content.find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use block in response");
  return toolUse.input as unknown;
}
```

- [ ] **Step 4: `_shared/supabase.ts`**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

// User-scoped client: RLS enforces ownership; JWT comes from the request.
export function userClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
}

// Service-role client: cron path only (no user JWT available).
export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
```

- [ ] **Step 5: `assistant/index.ts`**

```ts
import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { APPLY_ACTIONS_TOOL, PlanSchema } from "../_shared/actions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CATEGORY_LABELS: Record<string, string> = { personal: "Personal", powerplay: "PowerPlay", alberta_premium: "Alberta Premium" };

function edmontonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const { message } = await req.json();
    if (typeof message !== "string" || !message.trim())
      return Response.json({ error: "empty message" }, { status: 400, headers: CORS });

    const { data: openTasks } = await supabase.from("tasks")
      .select("id,title,category,due_date,priority_weight").eq("status", "open");

    const system = [
      "You are Olive, a personal task assistant. Today (America/Edmonton) is " + edmontonToday() + ".",
      "Convert the user's message into actions via the apply_actions tool.",
      "Categories: personal (default), powerplay (PowerPlay coatings business), alberta_premium (Alberta Premium job).",
      "For update/complete/delete, pick task_id ONLY from OPEN TASKS below (match loosely on wording).",
      "If the message references a task you cannot find, return zero actions and say so in reply.",
      "Resolve relative dates ('Friday', 'next week') to YYYY-MM-DD using today's date.",
      "Use add_memory only when the user asks to remember/note something that is not a task.",
      "OPEN TASKS:\n" + (openTasks ?? []).map((t) =>
        `${t.id} | ${t.title} | ${t.category} | due ${t.due_date ?? "none"} | p${t.priority_weight}`).join("\n"),
    ].join("\n");

    const raw = await callClaude({ system, user: message, tool: APPLY_ACTIONS_TOOL, toolName: "apply_actions" });
    const plan = PlanSchema.parse(raw); // zod gate — invalid LLM output stops here

    const confirmations: string[] = [];
    for (const a of plan.actions) {
      if (a.type === "create_task") {
        const { error } = await supabase.from("tasks").insert({
          user_id: user.id, title: a.title, category: a.category, due_date: a.due_date, priority_weight: a.priority_weight });
        if (error) throw error;
        confirmations.push(`Added task: ${a.title} (${CATEGORY_LABELS[a.category]}${a.due_date ? ", due " + a.due_date : ""})`);
      } else if (a.type === "update_task") {
        const { type: _t, task_id, ...patch } = a;
        const { data, error } = await supabase.from("tasks").update(patch).eq("id", task_id).select("title").single();
        if (error) throw error;
        confirmations.push(`Updated: ${data.title}`);
      } else if (a.type === "complete_task") {
        const { data, error } = await supabase.from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", a.task_id).select("title").single();
        if (error) throw error;
        confirmations.push(`Completed: ${data.title}`);
      } else if (a.type === "delete_task") {
        const { data, error } = await supabase.from("tasks").delete().eq("id", a.task_id).select("title").single();
        if (error) throw error;
        confirmations.push(`Deleted: ${data.title}`);
      } else if (a.type === "add_memory") {
        const { error } = await supabase.from("memories").insert({
          user_id: user.id, content: a.content, date: a.date, tags: a.tags });
        if (error) throw error;
        confirmations.push(`Noted: ${a.content}`);
      }
    }

    return Response.json({ reply: confirmations.length ? confirmations.join("\n") : plan.reply }, { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "assistant failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
```

- [ ] **Step 6: Deploy via MCP `deploy_edge_function`** (name `assistant`, JWT verification ON — default).

- [ ] **Step 7: `src/lib/api.ts`**

```ts
import { supabase } from "./supabase";

export async function sendToAssistant(message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("assistant", { body: { message } });
  if (error) throw new Error(error.message);
  return data.reply as string;
}

export async function generateBrief(): Promise<void> {
  const { error } = await supabase.functions.invoke("daily-brief", { body: {} });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 8: Verify end-to-end with real calls** (curl or a temporary script with a real session token):
  - "add a task to call the accountant Friday, high priority, PowerPlay" → row appears, reply `Added task: Call the accountant (PowerPlay, due 2026-07-10)`-style.
  - "mark the accountant one done" → status completed.
  - "delete the accountant task" → row gone.
  - "remember that the garage code is 4482" → memories row.
  - Nonsense ("purple monkey dishwasher") → no rows, sensible reply.
  Check `get_logs` (edge-function) for errors after each.

- [ ] **Step 9: Commit** — `git commit -m "feat: assistant edge function — NL capture via Claude tool-use with zod validation"`

---

### Task 9: ChatBar UI wired to `assistant`

**Files:**
- Create: `src/components/ChatBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `sendToAssistant` (Task 8), `useTasks().refresh` (Task 5), HUD classes (Task 6).

- [ ] **Step 1: `ChatBar.tsx`** — fixed bottom input (above tab nav), placeholder "Tell Olive…", works as a plain text field (Wispr Flow dictates into it). Submit → optimistic "thinking" pulse (`pulse-live`) → show reply as a dismissible confirmation toast panel (auto-dismiss 6s, tap to dismiss) → call `refresh()` so the list/brief update. Errors show the amber caution style with the message, input preserved for retry.

- [ ] **Step 2: Manual verification on live app** — typed phrase creates a task visible in TaskList without reload; error path (airplane mode) shows caution state.

- [ ] **Step 3: Commit** — `git commit -m "feat: chat capture bar wired to assistant with confirmations"`

---

### Task 10: Edge Function `daily-brief` + brief screen

**Files:**
- Create: `supabase/functions/_shared/brief.ts`, `supabase/functions/daily-brief/index.ts`, `src/hooks/useBrief.ts`, `src/components/BriefView.tsx`
- Modify: `src/App.tsx` (brief is the home view)

**Interfaces:**
- Consumes: schema (Task 3), ranking/date logic (Task 4 — mirrored in `_shared/brief.ts` for Deno), HUD classes (Task 6).
- Produces: `POST /functions/v1/daily-brief` — cron path (header `x-cron-secret`) and user path (JWT). Upserts `daily_briefs` row for Edmonton-today. `useBrief()` → `{ brief, tasksById, loading, stale, regenerate(), saveManualOrder(ids: string[]) }`.

- [ ] **Step 1: `_shared/brief.ts`** — pure builder (same scoring constants as `src/lib/ranking.ts`; keep the two in sync — they are small and the duplication is deliberate to avoid a cross-runtime shared package in v1):

```ts
export function edmontonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
}
export function edmontonHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", hour: "numeric", hour12: false }).format(now));
}
function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
type BriefTask = { id: string; due_date: string | null; priority_weight: number; created_at: string };
function score(t: BriefTask, today: string): number {
  if (!t.due_date) return t.priority_weight;
  const d = daysBetween(today, t.due_date);
  if (d < 0) return 100 + Math.min(-d, 30) + t.priority_weight;
  if (d === 0) return 80 + t.priority_weight;
  return Math.max(0, 50 - d * 5) + t.priority_weight;
}
export function buildBrief(tasks: BriefTask[], today: string) {
  const dated = (pred: (d: number) => boolean) =>
    tasks.filter((t) => t.due_date && pred(daysBetween(today, t.due_date))).map((t) => t.id);
  return {
    overdue: dated((d) => d < 0),
    today: dated((d) => d === 0),
    upcoming: dated((d) => d > 0 && d <= 7),
    suggested_order: [...tasks]
      .sort((a, b) => score(b, today) - score(a, today) || a.created_at.localeCompare(b.created_at))
      .map((t) => t.id),
  };
}
```

- [ ] **Step 2: `daily-brief/index.ts`**

```ts
import { serviceClient, userClient } from "../_shared/supabase.ts";
import { buildBrief, edmontonHour, edmontonToday } from "../_shared/brief.ts";

Deno.serve(async (req) => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const isCron = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET") && !!Deno.env.get("CRON_SECRET");
    let db, userId: string;

    if (isCron) {
      // Cron fires at 13:00 and 14:00 UTC; only the one matching 7am Edmonton proceeds (DST-proof).
      if (edmontonHour() !== 7) return Response.json({ skipped: "not 7am Edmonton" }, { headers: CORS });
      db = serviceClient();
      const { data: users, error } = await db.from("app_user").select("user_id").limit(1); // view created in cron migration
      if (error || !users?.length) throw error ?? new Error("no user");
      userId = users[0].user_id;
    } else {
      db = userClient(req);
      const { data: { user } } = await db.auth.getUser();
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
      userId = user.id;
    }

    const today = edmontonToday();
    const { data: tasks, error: terr } = await db.from("tasks")
      .select("id,due_date,priority_weight,created_at").eq("user_id", userId).eq("status", "open");
    if (terr) throw terr;

    const content = buildBrief(tasks ?? [], today);
    const { error } = await db.from("daily_briefs").upsert(
      { user_id: userId, brief_date: today, content, generated_at: new Date().toISOString() },
      { onConflict: "user_id,brief_date" });
    if (error) throw error;

    return Response.json({ ok: true, brief_date: today }, { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "brief failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
```

Note: the upsert deliberately does NOT touch `manual_order` — regeneration never clobbers the user's reorder. `app_user` is a security-definer view over `auth.users` (single user) created in the Task 11 migration; until then only the JWT path works, which is what Step 4 tests.

- [ ] **Step 3: Deploy `daily-brief` via MCP with JWT verification OFF** (cron has no JWT; auth is enforced in-function via CRON_SECRET or getUser).

- [ ] **Step 4: `useBrief.ts` + `BriefView.tsx`**

`useBrief`: fetch `daily_briefs` row for `edmontonToday()`; if none → call `generateBrief()` then refetch (graceful degradation). Expose `stale` = `generated_at` older than today 07:00 Edmonton. Join ids → live task rows from `useTasks`. `saveManualOrder(ids)` → `update daily_briefs set manual_order = ids where id = …`. Effective order = `manual_order ?? content.suggested_order`, filtered to still-open tasks.

`BriefView` (home): Orbitron "DAILY BRIEF" header + `generated_at` timestamp in font-data (amber "stale — regenerate" chip when stale, tap = `regenerate()`); ring-gauge hero (done-today vs due-today count, per the mobile reference design); three sections — Overdue (amber accents), Today, Next 7 Days (each `hud-panel`, tasks via `TaskCard`); "Suggested order" panel listing effective order with ↑/↓ buttons per row → `saveManualOrder`; complete-from-brief works (reuses `useTasks.completeTask`).

- [ ] **Step 5: Manual verification** — seed tasks (one overdue, one today, two this week, one undated-p5); open app → brief renders correct sections and order; reorder two rows → reload → manual order persists and wins; complete a task from brief → it drops out.

- [ ] **Step 6: Commit** — `git commit -m "feat: daily brief generation, brief screen with manual reorder"`

---

### Task 11: Migration 2 — pg_cron schedule (7:00 Edmonton, DST-proof)

**Files:**
- Create: `supabase/migrations/20260707000002_phase1_cron.sql`

**Interfaces:**
- Consumes: deployed `daily-brief` function (Task 10). Secrets: `CRON_SECRET` (generated now), Vault entries `project_url`, `cron_secret`.

- [ ] **Step 1: Generate + store secrets (NOT in the migration file).** Generate a random 32-char `CRON_SECRET`. (a) Set it as Edge Function secret `CRON_SECRET`; (b) store in Vault via MCP `execute_sql` (one-off, not a migration): `select vault.create_secret('<value>', 'cron_secret'); select vault.create_secret('https://<OLIVE_REF>.supabase.co', 'project_url');`

- [ ] **Step 2: Migration file** (no secret literals — reads Vault at runtime):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Single-user helper for the cron path (bypasses direct auth.users access from edge fn)
create view app_user with (security_invoker = off) as
  select id as user_id from auth.users order by created_at limit 1;
revoke all on app_user from anon, authenticated;
grant select on app_user to service_role;

-- 13:00 UTC = 7:00 MDT (summer); 14:00 UTC = 7:00 MST (winter).
-- The function itself checks Edmonton local hour == 7, so exactly one firing per day does work.
select cron.schedule(
  'olive-daily-brief',
  '0 13,14 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Apply via MCP `apply_migration`**, then verify: `select * from cron.job;` shows the job; manually fire the SQL body once via `execute_sql` → `select * from net._http_response order by id desc limit 1;` returns 200 and (because it's not 7am) the function logs `skipped: not 7am Edmonton` — that skip IS the correct behavior; the JWT path already proved brief-building works.

- [ ] **Step 4: Run `get_advisors` (security + performance)** — resolve anything the view/extensions raised.

- [ ] **Step 5: Commit** — `git commit -m "feat: pg_cron daily brief at 7am America/Edmonton (DST-proof dual firing)"`

---

### Task 12: PWA polish, verification pass, handoff

**Files:**
- Modify: `CLAUDE.md` (§ Commands), `index.html` (meta/title/theme-color)

- [ ] **Step 1: PWA + iPhone polish** — `index.html`: `<title>Olive</title>`, `theme-color #050B0A`, `viewport-fit=cover`, apple-touch-icon (generated in Task 1). `npm run build && npm run preview` → Lighthouse PWA installable check passes.

- [ ] **Step 2: Full verification pass (verify skill)** — drive the real flows end-to-end on the built app: sign in → NL create/edit/complete/delete (typed) → manual form CRUD → brief renders with correct Edmonton-date sections → manual reorder persists → on-demand regenerate works → `npm run test` green → `get_logs` clean → `get_advisors` clean.

- [ ] **Step 3: Update CLAUDE.md § Commands**

```markdown
## Commands
- `npm run dev` — local dev server
- `npm run build` — production build (`npm run preview` to serve it)
- `npm run test` — Vitest unit tests
- Migrations: add SQL file to `supabase/migrations/`, apply via Supabase MCP `apply_migration` (same SQL)
- Edge functions: edit under `supabase/functions/`, deploy via Supabase MCP `deploy_edge_function`
```

- [ ] **Step 4: Commit** — `git commit -m "chore: PWA polish, commands doc, phase 1 verification"`

- [ ] **Step 5: Plain-language handoff to Keenan** — what was built, how to install it on the iPhone home screen (Safari → Share → Add to Home Screen), how to test each "Done when" item, and the reminder that tomorrow ~7:00 the brief should be waiting. **Then STOP. Phase 2 does not start until Keenan explicitly approves.**

---

## Self-Review Notes

- **Spec coverage:** scaffold+auth+RLS (T1–T3), tasks/memories tables (T3), NL create/edit/complete/delete with confirmations (T8–T9), grouped task list + manual forms (T7), brief screen today/overdue/next-7 + suggested order + manual reorder wins (T4, T10), pg_cron 7:00 Edmonton pre-generation (T11), PWA (T1, T12). "Done when" both paths covered in T12 verification.
- **Type consistency:** `Plan/PlanSchema`, `Task/TaskInput`, `buildBrief` content shape `{overdue,today,upcoming,suggested_order}` used identically in T10 hook; scoring constants duplicated intentionally (`src/lib/ranking.ts` ↔ `_shared/brief.ts`) and both defined in-plan.
- **Known deliberate choices:** no Deno unit tests in v1 (edge logic verified by live calls in T8/T10/T11 — Deno toolchain not assumed on this machine); brief content stores ids only (UI joins live rows so completions reflect immediately); `manual_order` never overwritten by regeneration.
