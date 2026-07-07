# Build Plan — Olive v1

Phased spec. Each phase ends with a working, usable app. HARD GATE between phases: finish the phase, then stop and wait for the user to test the "Done when" condition and explicitly say to continue. Never begin the next phase without that approval. Phases marked **BLOCKED** have open questions (bottom of file) — do not build them until answered.

---

## Phase 1 — Tasks + daily brief (no external integrations)

The core loop, using only Supabase and the Anthropic API.

- Scaffold: React + Vite + Tailwind PWA, Supabase project, single-user email auth, RLS.
- Tables: `tasks` (id, user_id, title, category enum: personal/powerplay/alberta_premium, due_date, status, priority_weight, created_at, completed_at), `memories` (id, user_id, content, date nullable, tags, created_at).
- Chat input box (works with Wispr Flow dictation as plain text): natural-language create/edit/complete/delete of tasks via Edge Function → Claude → validated JSON → DB. Every action echoes a confirmation.
- Task list UI grouped by category; manual add/edit/delete as forms too (voice is not the only path).
- Daily brief screen: today / overdue / next 7 days, plus a suggested task order ranked by due-date proximity + priority_weight. User can reorder manually; manual order wins for that day.
- Scheduled generation: pg_cron (converted from 7:00 America/Edmonton) + pg_net → Edge Function builds the brief and stores it in a `daily_briefs` table so opening the app is instant.

**Done when:** tasks can be created/edited/completed by typed or dictated natural language AND by manual forms; the brief renders each morning with correct local-time logic.

## Phase 2 — Habits + journal

- Tables: `habits` (id, name, frequency enum daily/weekly, created_at), `habit_checkins` (id, habit_id, date, completed), `journal_entries` (id, date, raw_transcript, cleaned_text, tags).
- Habit check-off UI + streak calculation; streaks appear in the daily brief.
- Each check-in OFFERS an optional detail (note and/or duration) — one tap to skip, never required. Add `note` (text, nullable) and `duration_minutes` (int, nullable) to `habit_checkins`. When details exist, the assistant uses them (e.g. surfacing patterns or context in the brief), not just stores them.
- Journal: paste/dictate raw text → Edge Function → Claude produces cleaned_text; BOTH raw and cleaned stored and viewable. Cleaning rewrites for coherence only — never adds content, never changes meaning.
- Journal list + detail view, editable after the fact.

**Done when:** a rambling dictated entry produces a faithful cleaned version with the raw kept; streaks survive week boundaries correctly.

## Phase 3 — Active jobs log

- Table: `active_jobs` (id, name, status enum: quoted/sold/in_progress/paid, sheet_row_ref nullable, created_at, updated_at, notes nullable).
- Natural-language capture: "add a job, Dennis's driveway" / "mark the Flames job paid."
- Jobs appear in the daily brief (active count + anything that changed status yesterday).

**Done when:** jobs can be created and moved through statuses by voice/text and manually; brief includes them.

## Phase 4 — Google Calendar sync (OAuth #1)

- Google Cloud project, OAuth consent (internal/test mode is fine for single user), Calendar read/write scope.
- Two-way basics: events show in the brief; natural-language "reschedule X to Thursday" updates the real calendar event.
- Store tokens server-side (Supabase), refresh handled in Edge Functions.

**Done when:** the daily brief shows real calendar events and a natural-language reschedule is visible in Google Calendar itself.
(Confirmed: Google Calendar is the user's live calendar.)

## Phase 5 — Google Sheets pay sync (OAuth #2, read-only)

- Reuse the Phase 4 Google OAuth setup, add Sheets read-only scope.
- Read the user's existing pay tracker sheet on a schedule + on demand; match jobs in `active_jobs` to sheet rows (fill `sheet_row_ref`).
- Mismatch detection: a job mentioned in-app but absent from the sheet → reminder in the brief ("Dennis's driveway isn't in your pay sheet yet"). NEVER write to the sheet.

**Done when:** pay figures from the sheet display against matched jobs; an unmatched job produces a reminder.
**BLOCKED on Q1** (need the actual sheet link to map tabs/columns — do not guess the structure).

## Phase 6 — Finance agent (Plaid, read-only)

- Plaid Trial plan, `CA` country code, Transactions + Balance products ONLY. Link flow in-app; access tokens stored server-side only.
- Daily sync into `finance_snapshot` tables (accounts, balances, transactions, detected recurring charges).
- Recurring-charge detection (Plaid's recurring transactions endpoint where supported; simple pattern-match fallback) → upcoming charges appear in the brief N days ahead.
- Brief shows a daily money section: current balance + total spent today (confirmed definition). Staleness is first-class: if the connection breaks (common with Canadian banks), show "data from <date> — tap to re-link," never silently-wrong numbers.

**Done when:** real balance + recent transactions render; a known subscription is flagged before it hits; a broken link shows the stale-data state.
**BLOCKED on Q2** (which bank(s), personal and/or business account — confirm Plaid coverage first).

## Phase 7 — Pace tracker, maintenance log, weather

- `income_goals` (id, month, target_amount): set by voice ("goal this month is 8 grand"); brief shows month-to-date vs pace from paid jobs/sheet data. Informational tone only — display pace, never nag.
- `maintenance_items` (id, name, interval_days nullable, cycle_count nullable, last_done, next_due): voice-logged; due items surface in the brief.
- Weather: Environment Canada or Open-Meteo (free, no key) for Calgary, folded into the brief; flag rain/cold relevant to coating work and riding.

**Done when:** all three appear in the brief with no new screens required beyond simple lists.

## Phase 8 — Telegram bot (mobile front door)

- Telegram bot via webhook → Edge Function. Voice notes: download file → STT (see Q3) → same orchestrator pipeline as the in-app chat. Text messages likewise.
- Replies confirm actions in Telegram. Restrict the bot to the user's Telegram ID only.

**Done when:** a voice note from the phone creates/edits real records and gets a confirmation reply; any other Telegram user is ignored.

## Phase 9 — TTS brief + orchestrator polish

- "Read my brief" button: TTS playback of the brief (see Q4 for engine choice).
- Unify routing: one entry point that classifies intent (task/job/habit/journal/finance question/general) and dispatches — the in-app chat and Telegram share it. This is mostly refactoring what already exists.

**Done when:** the same sentence works identically from the app and Telegram, and the brief can be listened to.

---

## Deferred (do not build in v1)

Wake-word/always-listening voice; customer records/quotes/invoices; any money movement; any approval-queue machinery (nothing executes, so nothing needs approving); writing to the Google Sheet; multi-user anything.

**Later idea, not decided, zero cost to wait:** an optional read-only markdown export of journal entries and daily briefs, synced to a folder for browsing in Obsidian (or similar). Olive would never read from it — it's a mirror for the user, not a memory source. Safe to add anytime later since the underlying data is already structured rows in Postgres; exporting it doesn't require any current schema or architecture changes.

## Open questions — blocked until answered

- **Q1:** Pay sheet link + which tabs/columns hold job name, labor type, and pay. Structure must come from the real sheet. (Blocks Phase 5.)
- **Q2:** Which bank(s) to link — personal only, or PowerPlay business account too? Verify Plaid CA coverage for the specific institution(s) before Phase 6.
- **Q3:** STT engine for Telegram voice notes — default suggestion: OpenAI Whisper API (cheap, accurate); decide before Phase 8.
- **Q4:** TTS engine — free/built-in browser speechSynthesis (robotic but zero cost) vs a paid natural voice (e.g. OpenAI or ElevenLabs); decide before Phase 9.

Resolved: Google Calendar confirmed as the live calendar (Phase 4 unblocked). Daily total = balance + today's spending. Habits = check-off + streaks with optional per-check-in note/duration.
