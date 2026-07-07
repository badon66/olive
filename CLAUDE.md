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
- The user is not a professional developer: explain what you built and how to test it in plain language at the end of each phase.

## Stack

- Frontend: React + Vite + Tailwind, PWA. Mobile-first (primary device: iPhone via browser; desktop secondary).
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

## Design direction

Olive's look is intentional, not default Tailwind gray — a "techy Jarvis" feel, Iron Man style: glassy holographic HUD, glowing green rings and circuits. No job-ticket/trade-signage motif — that direction was dropped in favor of this one. Prompt to use with the UI/UX Pro Max skill for any UI-heavy phase:

> Create a personal assistant PWA dashboard with a glassy holographic HUD interface, glowing green circuit rings and accents, a daily brief view, active jobs and pay tracker, habit streak tracking, and voice/text quick-capture entry points. Use a dark sci-fi Iron-Man-style holographic green theme.

Concrete tokens if not re-derived by the skill:
- Colors: void `#050B0A` (background), panel `rgba(12,32,26,0.55)` with backdrop-blur (glass panels), signal-green `#2EFFB5` (primary glow/accent), signal-green-dim `#1D8F6B` (secondary lines/borders), text `#EAFBF3` (primary), text-dim `#7FA89A` (secondary), amber `#FFB454` (caution/reminder — used sparingly, HUD-style "not nominal" signal), red `#FF5C5C` (critical only)
- Type: Orbitron (HUD headers/display numbers), Rajdhani (body/labels — techy but legible), IBM Plex Mono (data/timestamps/tags)
- Motif: glassmorphic panels with thin glowing borders, circular HUD rings/arcs, corner-bracket framing on cards (like a targeting reticle), subtle scan-line or grid texture in backgrounds, radial glow behind key numbers, gentle pulse animation on live/updating data
- Apply this direction from Phase 1 onward so components are styled correctly from the start rather than needing a redesign pass later

**Reference designs (in `design/`):**
- `olive-dashboard-concept.html` — compact mobile dashboard (ring-gauge hero), for phone/narrow viewports
- `desktop-orb/` (or `olive-desktop-orb.html`) — ultrawide/desktop dashboard, built in Claude Design: a glowing particle orb centered in the upper-middle of the screen as Olive's presence, with expanded info panels (not compressed) spread around it, each expandable in place on click
- Use whichever matches the current viewport as the visual reference; both share the same token system above

## Plugins in use (installed globally, auto-activate — no need to invoke by name)

- **Superpowers** (`superpowers@claude-plugins-official`) — enforces plan-before-code, TDD, systematic debugging, two-stage review across all phases
- **UI/UX Pro Max** (`ui-ux-pro-max@ui-ux-pro-max-skill`) — design system generation; feed it the prompt above for any new screen or component

## Commands

- After scaffolding the project, fill this section in with the actual dev/build/migration commands and keep it current as the project evolves.

## What this project is NOT

- Not multi-user, not a SaaS. No billing, no team features.
- Not a CRM yet (jobs are name + status + timestamps in v1).
- No wake-word/always-listening voice in v1. Voice in = Wispr Flow dictation (desktop) + Telegram voice notes (phone). Voice out = TTS reading the daily brief.
