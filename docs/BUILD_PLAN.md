# Build Plan — Olive v1

Phased spec. Each phase ends with a working, usable app. HARD GATE between phases: finish the phase, then stop and wait for the user to test the "Done when" condition and explicitly say to continue. Never begin the next phase without that approval. Phases marked **BLOCKED** have open questions (bottom of file) — do not build them until answered.

---

## Phase 1 — Tasks + daily brief (no external integrations)

The core loop, using only Supabase and the Anthropic API.

- Scaffold: React + Vite + Tailwind PWA, Supabase project, single-user email auth, RLS.
- Tables: `categories` (id, user_id, name, created_at — seeded with Personal, PowerPlay Customs, Alberta Premium Coatings by default, but the user can add more anytime, by voice or in the UI — this is NOT a fixed enum), `tasks` (id, user_id, title, category_id references categories, due_date, scheduled_time nullable time — set only when the task is a fixed-time booking/appointment, distinct from the flexible `time_section`, status, priority_weight, duration_minutes nullable, time_section enum: morning/midday/afternoon/evening/anytime nullable, created_at, completed_at), `memories` (id, user_id, content, date nullable, tags, created_at).
- Chat input box (works with Wispr Flow dictation as plain text): natural-language create/edit/complete/delete of tasks via Edge Function → Claude → validated JSON → DB. Every action echoes a confirmation. Includes creating a new category by voice ("make a new section called Groceries").
- Task list UI grouped by category; manual add/edit/delete as forms too (voice is not the only path). User can change a task's `time_section` and `duration_minutes` directly.
- Due date picker: a proper popup mini calendar, not a native browser date input or dropdown. No prominent year selector needed — everything defaults to the current year.

**Wake time:** `wake_times` table (date, wake_time) — a default of 11:00 applies unless overridden. Each evening (as part of brief generation), ask "what time are you waking up tomorrow?"; answer, if given, overrides the default for that date only. `time_section` boundaries (morning/midday/afternoon/evening) shift relative to wake_time, not a fixed clock — "morning" starts at wake_time, not 7 AM, if wake_time is 11.

**Daily tasks (recurring, always-on-today):** `daily_tasks` (id, title, time_section, created_at), `daily_task_checkins` (id, daily_task_id, date, completed) — same pattern as habit check-ins. "Add daily task" via voice/text creates one; if no time_section is given, ask ("first thing in the morning, midday, or later?"). These appear on the today view every day without needing a due date.

- Daily brief screen: today, plus a **next 7 days** section shown as individual day blocks (one per day, Monday-first through Sunday) each showing a condensed summary of what's on that day — not a flat list.
- **Priorities as a collapsible dropdown, not a long visible list.** Collapsed by default, showing just a summary line — e.g. "Priorities — 3 overdue". Overdue tasks are NOT their own section; they're folded into the top of this same dropdown, sorted first, so they're visible in the summary without needing a separate block. Expanding it reveals the full ranked list (due-today + pulled-forward, per the suggested-schedule logic below).
- **Suggested schedule, not just a ranked list:** overdue + due-today tasks are the must-do baseline. If a `time_section` has little or nothing due in it, pull forward the highest-priority non-due tasks to fill that room, using `duration_minutes` as a rough guide — but always show clearly which items are "due today" vs "pulled forward because there's room," never blend them silently. This is still a suggestion: user can reorder, move sections, or edit duration, and manual placement wins for that day.
- **Cross-panel drag-and-drop:** tasks can be dragged between the Priorities dropdown, Habits, Today's schedule (time sections), and the next-7-days day blocks. Dragging a task onto a day block sets its `due_date` to that day (e.g. drag "renew license" onto Tuesday's block → due_date becomes Tuesday, it now shows there). Dragging within Today's schedule updates `time_section`. Each drop writes to the database immediately, not just a visual move. Needs a drag-and-drop library (Claude Code's choice — e.g. dnd-kit) — this is a real UI feature, not a quick styling patch, budget accordingly.
- Scheduled generation: pg_cron (converted from 7:00 America/Edmonton) + pg_net → Edge Function builds the brief and stores it in a `daily_briefs` table so opening the app is instant.

**Follow-up fix round (Phase 1 already built, these are corrections, not new scope):** migrate the existing fixed category enum to the `categories` table above; replace the current due-date input with the calendar popup; convert the next-7-days list into day blocks; add wake-time-anchored scheduling and daily tasks as described above; collapse Priorities into a dropdown with overdue folded in; add `scheduled_time` for bookings; add cross-panel drag-and-drop.

**Done when:** tasks can be created/edited/completed by typed or dictated natural language AND by manual forms; the brief renders each morning with correct local-time logic.

## Phase 2 — Habits + journal

- Tables: `habits` (id, name, target_per_week int 1-7 — e.g. "every day" = 7, "3x a week" = 3, created_at), `habit_checkins` (id, habit_id, date, completed), `journal_entries` (id, date, raw_transcript, cleaned_text, tags).
- Habit display: each habit shown as a row of **7 cubes, Monday first through Sunday last**, filled in as checked off that day. A small indicator shows progress against `target_per_week` (e.g. "2/3 this week"), not just a streak count. Week boundary = Monday.
- Each check-in OFFERS an optional detail (note and/or duration) — one tap to skip, never required. Add `note` (text, nullable) and `duration_minutes` (int, nullable) to `habit_checkins`. When details exist, the assistant uses them (e.g. surfacing patterns or context in the brief), not just stores them.
- Journal: paste/dictate raw text → Edge Function → Claude produces cleaned_text; BOTH raw and cleaned stored and viewable. Cleaning rewrites for coherence only — never adds content, never changes meaning.
- Journal list + detail view, editable after the fact. **Keep it visually small and low-priority in the layout** — it's a quick-capture utility, not a core feature; don't give it a large dedicated section. Watch for layout overlap with other panels (e.g. Alberta Premium Coatings section) — it should never render hidden behind another panel.

**Done when:** a rambling dictated entry produces a faithful cleaned version with the raw kept; the 7-cube week resets correctly on Monday and progress-vs-target displays accurately; journal renders compactly with no layout overlap.

## Phase 3 — Active jobs log

- Table: `active_jobs` (id, name, status enum: quoted/sold/in_progress/paid, category_id references the same `categories` table as tasks, sheet_row_ref nullable, created_at, updated_at, notes nullable).
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

## Phase 7.5 — Design polish pass

Deliberately separate from Phases 1–7. Don't chase pixel-perfect matching after each individual phase above — the layout will keep shifting as panels get added, so judging it early wastes effort. This is the one dedicated pass, once there's enough real content on screen (tasks, habits, jobs, finance, pace, maintenance, weather) to actually judge against Olive Dashboard v2.

- Use the UI/UX Pro Max skill + the Claude Design reference together to bring the full dashboard in line: orb placement, panel spacing, which panels deserve more visual weight, spacing rhythm.
- This is a styling pass on existing components, not a rebuild — same "modify, don't rebuild" instruction as before applies.
- **Done when:** the dashboard, with all Phase 1–7 content present, genuinely resembles Olive Dashboard v2 — not before, since there isn't enough content to compare against until this point.

## Phase 8 — Telegram bot (mobile front door)

- Telegram bot via webhook → Edge Function. Voice notes: download file → STT (see Q3) → same orchestrator pipeline as the in-app chat. Text messages likewise.
- Replies confirm actions in Telegram. Restrict the bot to the user's Telegram ID only.

**Done when:** a voice note from the phone creates/edits real records and gets a confirmation reply; any other Telegram user is ignored.

## Phase 9 — TTS brief + orchestrator polish

- "Read my brief" button: TTS playback of the brief via **ElevenLabs** (confirmed choice — natural voice, not the free browser default). Needs its own API key from elevenlabs.io, stored as a Supabase Edge Function secret the same way the Anthropic key is.
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


Resolved: Google Calendar confirmed as the live calendar (Phase 4 unblocked). Daily total = balance + today's spending. Habits = check-off + streaks with optional per-check-in note/duration. TTS engine = ElevenLabs (Phase 9).
