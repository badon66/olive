# Olive — Project Rules

Olive is a single-user personal assistant PWA for Keenan. Voice/text in, insights and reminders out.
The phased spec is in `docs/BUILD_PLAN.md`. Build ONE phase at a time, then stop for approval.

## Scope: v1 is read-and-remind only

- v1 executes NO real-world actions: no paying bills, no moving money, no sending emails or texts, no writing to the user's Google Sheet. It reads, logs, reminds, and advises.
- Execution features (acting on the user's behalf) are planned for a LATER version, and only through a deliberate approval-queue design where every action waits for the user's explicit tap. Do not add execution ad hoc in v1, even if it seems helpful.
- Two rules that stay firm in every version unless the user explicitly changes them:
  - The user's Google Sheet is read-only. Missing data = a reminder in the app, never a write to the sheet.
  - Plaid stays read-only (Transactions/Balance products only). Never add transfer or payment products.

## Security (non-negotiable)

- All secrets (Anthropic API key, Plaid keys, Google OAuth credentials, Telegram bot token) live in Supabase Edge Function secrets or a gitignored `.env`. Never in frontend code, never committed, never exposed to the browser.
- All LLM calls happen server-side in Supabase Edge Functions. The React app never calls the Anthropic API directly.

## Working style

- Implement only the current phase, then STOP and wait for the user to test it and explicitly approve moving on. Never start the next phase on your own.
- If the spec is ambiguous, ask — don't invent. Open questions are listed at the bottom of BUILD_PLAN.md; anything touching them is blocked until answered.
- **File ownership:** `docs/BUILD_PLAN.md` is the spec — it comes from the user's planning sessions elsewhere and gets replaced wholesale when it changes. Don't restructure it, annotate it, or add your own status markers directly into it. Instead, track what's built, what's tested, and any implementation notes in `docs/PROGRESS.md` — a separate file you own and maintain freely. This keeps the spec and the build log from overwriting each other.
- The user is not a professional developer: explain what you built and how to test it in plain language at the end of each phase.

## Stack

- Frontend: React + Vite + Tailwind, PWA. **Desktop/ultrawide-first** (primary device: PC/ultrawide monitor, ~30" class; iPhone via browser is secondary). Build the ultrawide layout as the real target, then adapt down for phone — not the other way around.
- **No capped-width containers.** Don't wrap the layout in a fixed `max-w-4xl`/`max-w-6xl`-style container that leaves large empty margins on a wide screen. The layout should genuinely use the full viewport width, with padding that scales, not a narrow column centered in empty space.
- **Grid, not fixed columns.** Panels should use a responsive grid (CSS Grid `auto-fit`/`minmax`, not a hardcoded 2-column layout) so more columns appear as the viewport gets wider — a 2560px+ screen should show meaningfully more side-by-side content than a 1440px laptop, not the same layout stretched.
- Add an explicit ultrawide breakpoint (e.g. `xl`/`2xl` around 1920–2560px) rather than relying only on Tailwind's default `lg` (1024px), which stops scaling far short of an actual ultrawide monitor.
- Backend: Supabase — Postgres, Auth, Edge Functions (Deno), pg_cron + pg_net for scheduled jobs.
- LLM: Anthropic API from Edge Functions; `claude-sonnet-4-6` for parsing/routing unless quality demands escalation.
- Single user: Supabase email auth, one account, RLS on all tables.
- Timezone: America/Edmonton for ALL scheduling logic. Cron runs in UTC — convert explicitly.

## Conventions

- TypeScript everywhere, including Edge Functions.
- Schema changes via Supabase CLI migration files only.
- Natural-language capture pattern: user text → Edge Function → Claude with a JSON schema → validate with zod → write to Postgres. Every LLM-driven write returns a plain confirmation ("Added job: Dennis's driveway").
- Graceful degradation: if an external source (Plaid, Sheets, weather) is stale or disconnected, show it in the UI with the last-synced time. Never present stale data as current.
- Keep components small; no state management library until genuinely needed.
- Categories/sections are user-defined and extensible (a `categories` table), never a fixed enum. Default seeded set: Personal, PowerPlay Customs, Alberta Premium Coatings — but the user can create more anytime, by voice or in the UI (e.g. "Groceries"). Every table that groups by category (tasks, jobs, etc.) should reference this same table.
- "Weekly tasks" (formerly "Habits") support two recurrence modes: a flexible weekly count ("4 times a week," any days) or specific fixed days ("Mon/Wed/Fri/Sun," or "every day"). Displayed as 7 cubes, Monday first through Sunday last. Fixed-days tasks also surface in the actual daily schedule on their scheduled days, not just their own tab.

## Design direction

Olive's look is intentional, not default Tailwind gray — a "techy Jarvis" feel, Iron Man style: glassy holographic HUD, glowing green rings and circuits. No job-ticket/trade-signage motif. **Color updated (v3 direction): darker, richer forest/emerald green — muted, not neon** — replacing the earlier bright neon-mint accent. Prompt to use with the UI/UX Pro Max skill for any UI-heavy phase:

> Create a personal assistant PWA dashboard with a glassy holographic HUD interface, a persistent left sidebar for navigation, glowing dark-green circuit rings and accents (muted forest green, not neon), a daily brief view, active jobs and pay tracker, weekly task tracking, and voice/text quick-capture entry points. Use a dark sci-fi Iron-Man-style theme with a deep, rich green rather than a bright neon one.

Concrete tokens if not re-derived by the skill:
- Colors: void `#070D0A` (background, slightly green-black), panel `rgba(10,26,18,0.55)` with backdrop-blur (glass panels), signal-green `#1F6E45` (primary accent, rest state — deep forest green, NOT neon), signal-green-glow `#3FA968` (brighter, used only for hover/active glow, not as a resting color), text `#EAFBF3` (primary), text-dim `#7FA89A` (secondary), amber `#FFB454` (caution/reminder — used sparingly), red `#FF5C5C` (critical only)
- Type: Orbitron (HUD headers/display numbers), Rajdhani (body/labels — techy but legible), IBM Plex Mono (data/timestamps/tags)
- Motif: glassmorphic panels with thin glowing borders, circular HUD rings/arcs, corner-bracket framing on cards (like a targeting reticle), subtle scan-line or grid texture in backgrounds, radial glow behind key numbers, gentle pulse animation on live/updating data
- **Hover treatment on panels/cards:** a soft outer glow (box-shadow in signal-green-glow) plus a thin brighter highlight line along the top edge — a "sheen," not a full neon outline
- **Persistent left sidebar for navigation** — sized comfortably large and legible, not cramped. Nav items: Dashboard, Tasks, Weekly Tasks, Active Jobs, Journal, Finance, Groceries (reserved nav slot only — no feature behind it yet, do not build), Settings. This is the ONLY navigation; don't duplicate these same links again as cards in the main content area. Main content shows real information, not decorative shortcut tiles.
- **Dedicated per-category sections on the Dashboard** — one panel per category (Personal, PowerPlay Customs, Alberta Premium Coatings, and any category the user adds later), each showing only that category's own tasks, with a colored left-edge accent matching the category's color. This must scale dynamically with however many categories actually exist — don't hardcode three panels.
- **Edit-mode pattern:** sections that support quick editing get ONE pencil icon in the section header, not a per-row edit button. Tapping it toggles edit mode for that section's items. Anything not editable this way lives on its own dedicated sidebar tab instead (e.g. full task management, Finance detail).
- **Voice-preview pop-up:** the preview-before-send breakdown (see BUILD_PLAN.md Phase 1) is a centered modal with a backdrop, not an inline element under the input box — and it only appears after a voice capture, not typed text.
- Apply this direction from Phase 1 onward so components are styled correctly from the start rather than needing a redesign pass later

**Reference designs:**
- `design/olive-dashboard-concept.html` — compact mobile dashboard (ring-gauge hero), for phone/narrow viewports — predates the v3 update, treat as directionally outdated (old color, no sidebar)
- Olive Dashboard v2, in Claude Design — **superseded, historical only**, kept for reference: https://claude.ai/design/p/d09f0baf-cf0c-4fb3-a29d-5413b49713cf?file=Olive+Dashboard+v2.dc.html
- **Desktop/ultrawide (current source of truth): v3, local files in `design/`:**
  - `design/olive-dashboard-v3-clean.html` — full dashboard layout, no modal, use this to judge overall structure/spacing
  - `design/olive-dashboard-v3.html` — same dashboard, with the voice-preview modal shown open, use this specifically to see how that pop-up should look
  - Both share the same token system above: sidebar nav, darker forest green, orb, hover glow, dedicated category sections

## Plugins in use (installed globally, auto-activate — no need to invoke by name)

- **Superpowers** (`superpowers@claude-plugins-official`) — enforces plan-before-code, TDD, systematic debugging, two-stage review across all phases
- **UI/UX Pro Max** (`ui-ux-pro-max@ui-ux-pro-max-skill`) — design system generation; feed it the prompt above for any new screen or component

## Commands

- `npm run dev` — local dev server (http://localhost:5173)
- `npm run build` — typecheck + production build (`npm run preview` to serve it)
- `npm run test` — Vitest unit tests (`src/**/*.test.ts`)
- `npm run lint` — oxlint
- Migrations: add a SQL file to `supabase/migrations/`, apply the identical SQL to project `dpkdsmvskryettdxcvpp` via Supabase MCP `apply_migration`
- Edge functions: edit under `supabase/functions/`, deploy via Supabase MCP `deploy_edge_function` (include `_shared/*` files; `daily-brief` deploys with verify_jwt OFF, `assistant` and `journal-clean` with it ON)
- Secrets: `anthropic_api_key`, `cron_secret`, `project_url` all live in Supabase Vault (read by edge functions via service-role-only RPCs `get_anthropic_key()`/`get_cron_secret()`); local copies in gitignored `.env`/`.env.local`
- Keep this section current as the project evolves — add new scripts, functions, or secrets here as they're built.

## What this project is NOT

- Not multi-user, not a SaaS. No billing, no team features.
- Not a CRM yet (jobs are name + status + timestamps in v1).
- No wake-word/always-listening voice in v1. Voice in = Wispr Flow dictation (desktop) + Telegram voice notes (phone). Voice out = TTS reading the daily brief.
