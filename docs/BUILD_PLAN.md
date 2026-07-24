# Build Plan — Olive v1

Phased spec. Each phase ends with a working, usable app. HARD GATE between phases: finish the phase, then stop and wait for the user to test the "Done when" condition and explicitly say to continue. Never begin the next phase without that approval. Phases marked **BLOCKED** have open questions (bottom of file) — do not build them until answered.

---

## Phase 1 — Tasks + daily brief (no external integrations)

The core loop, using only Supabase and the Anthropic API.

- Scaffold: React + Vite + Tailwind PWA, Supabase project, single-user email auth, RLS.
- Tables: `categories` (id, user_id, name, color hex, created_at — seeded: Personal = blue, PowerPlay Customs = yellow, Alberta Premium Coatings = a true/pure green, distinct from Olive's own signal-green HUD accent — user can add more anytime, by voice or in the UI, this is NOT a fixed enum), `tasks` (id, user_id, title, category_id references categories, due_date nullable, scheduled_time nullable time — set only when the task is a fixed-time booking/appointment, distinct from the flexible `time_section`, status, priority_weight, duration_minutes nullable, time_section enum: morning/midday/afternoon/evening/anytime nullable, created_at, completed_at), `memories` (id, user_id, content, date nullable, tags, created_at).
- Chat input box (works with Wispr Flow dictation as plain text): natural-language create/edit/complete/delete of tasks via Edge Function → Claude → validated JSON.
- **Preview-before-send, as a pop-up modal, voice-only.** After a voice capture is parsed, a centered modal (with backdrop) shows exactly what was understood — not yet saved. Typed text does NOT trigger this modal, since it's already visible/correctable as you type it; this is specifically a check on voice transcription and parsing. Three actions in the modal: pencil icon to edit any field directly, X to discard with nothing created, "Send off" to actually commit it. Applies to voice capture everywhere it's used (tasks, jobs later, weekly tasks) — a shared pattern, not a one-off.
- Task list UI grouped by category; manual add/edit/delete as forms too (voice is not the only path). User can change a task's `time_section` and `duration_minutes` directly.
- **Category tags:** every task shows a small colored corner tag with its category's color and name. A categories section lists all of them with a pencil icon each, to rename or recolor.
- **Dedicated per-category sections on the Dashboard:** one panel per category (Personal, PowerPlay Customs, Alberta Premium Coatings, and any the user adds later), each listing only that category's own tasks, with a colored left-edge accent matching the category. Must scale with however many categories actually exist — don't hardcode three.
- **A separate "Tasks" sidebar tab** for full task management (all tasks, all time, filterable by category/status/scheduled), distinct from the Dashboard's glanceable Today view.
- **Item editing:** clicking an existing item directly opens an edit modal scoped to just that item, with every real, relevant field editable — click "Gym" under Weekly Tasks to change its frequency/planned days; click a task under any category section to edit title/category/due date/booked time/part-of-day/duration/priority. Delete lives inside the modal (two-tap confirm), not as a separate icon on the row.
- **The top-corner pencil is a single ON/OFF toggle for "add mode" — drag/reposition/resize has been REMOVED entirely (tried, too complex for the value, cut deliberately). Layout is fixed per the arrangement above, not user-rearrangeable.**
  - **While ON:** each relevant section header (Weekly Tasks, each category panel) shows a small "+" button for adding a new item directly into that section.
  - **While OFF:** the "+" buttons aren't visible — clean view.
  - **Editing an existing item** (click a task, weekly task, or category directly) is NOT gated behind this toggle — always available either way, opens a full edit modal for every real field on it.
  - **Do not build or leave in place any drag-to-reposition-sections or horizontal-resize-sections logic.** If it exists from a prior attempt, remove it rather than leaving dead/broken code.
- **Customize layout mode (new, substantial feature — treat as its own build effort, not a quick add-on):** every dashboard section gets a drag handle sized exactly to its real visual bounding box (no oversized/undersized hitbox). Sections can be dragged to reposition them, and can shrink horizontally to fit into a narrower slot if dropped somewhere tighter than their default width. Each section's title becomes an editable text field while in this mode, so any section — including built-in ones like "Weekly Tasks" or "Today's Schedule" — can be renamed, not just user-created categories. The resulting arrangement must persist per-user (a `dashboard_layout` table or JSON column storing each section's position/size/label), not just live in local component state — it should look the same next time the app opens. Recommend a dedicated grid-layout library built for exactly this (e.g. react-grid-layout) rather than hand-rolling drag+resize+reflow from scratch.
- **Dashboard layout — fixed arrangement, NOT user-rearrangeable. Supersedes all earlier layout versions:**
  - **Center unit:** the orb (full size — no need to shrink it) directly above the capture/talk box, stacked as one vertical unit.
  - **Left flank, running alongside the full height of the center unit:** Active Tasks (shows ONLY tasks relevant to the current part of day — e.g. midday tasks display at midday). If Active Tasks doesn't reach the same height as Today's Schedule on the right, Active Jobs fills the remaining space directly below it, so the left flank's total height matches the right flank's.
  - **Right flank, same height as the left, spanning the full height of the center unit:** Today's Schedule — full length, the full day, all time sections.
  - **Below the entire flanking row, edge to edge (full width, not just centered):** Finance — slightly thicker/taller than a standard panel.
  - **Below Finance, left side:** Weekly Tasks.
  - **Below Finance, right side, stacked top to bottom:** Upcoming Days → Journal (Active Jobs is NOT here — it moved to the left flank above).
  - **Below that, full width, compact/thin:** Priorities — deliberately deprioritized and visually slim, not removed.
  - **Bottom of the page, full width:** the three category panels (Personal, PowerPlay Customs, Alberta Premium Coatings).
  - On mobile: single column, same top-to-bottom order; category panels move to their own Tasks-tab view to keep the scroll manageable.
- **Sidebar navigation:** Dashboard, Tasks, Weekly Tasks, Active Jobs, Journal, Finance, Groceries (reserved nav slot only — no feature behind it, do not build), Settings.
- **Scheduled / Not scheduled indicator** on every task regardless of category: "Scheduled" if `due_date` is set, "Not scheduled" if not.
- Due date picker: proper popup mini calendar — already built, no further work needed.

**Tomorrow's schedule setup (replaces a nightly auto-prompt):** a manual icon, "Set up tomorrow's schedule," showing Completed/Uncompleted. Tapping it lets the user give a quick blurb (voice or text) covering wake time AND any blocked windows ("up around 9, dentist 2 to 3:30, don't schedule then"), parsed into a `daily_schedule_setup` row (date, wake_time, blocked_windows jsonb). `time_section` boundaries shift relative to wake_time, not a fixed clock, and the pulled-forward-task logic avoids suggesting anything into blocked windows.

(No separate "daily tasks" system — anything that happens every day is just a Weekly Task set to all 7 fixed days. See Phase 2. Do not build a standalone daily-tasks table.)

- Daily brief screen: today, plus an **Upcoming Days** row — today + next 3 days shown as **4 blocks side by side horizontally**, not stacked, with an expand arrow to see the full week. Chronological from today.
- **Priorities as a collapsible dropdown, not a long visible list.** Collapsed by default, showing a summary line — e.g. "Priorities — 3 overdue". Overdue tasks fold into the top of this same dropdown, sorted first, not their own section. Expanding reveals the full ranked list (due-today + pulled-forward, per the suggested-schedule logic below).
- **Suggested schedule, not just a ranked list:** overdue + due-today tasks are the must-do baseline. If a `time_section` has little or nothing due in it (and isn't a blocked window), pull forward the highest-priority non-due tasks to fill that room, using `duration_minutes` as a rough guide — always show clearly which items are "due today" vs "pulled forward," never blended silently. Still a suggestion: user can reorder, move sections, edit duration; manual placement wins for that day.
- **Cross-panel drag-and-drop**, between Priorities, Weekly Tasks, Today's schedule (time sections), and the Upcoming Days blocks:
  - Task → a day block: sets `due_date` to that day. If the task has a `scheduled_time` (a booking), the time stays — only the date changes.
  - Task → a Today's schedule section: updates `time_section`.
  - Task → Weekly Tasks, or Weekly Task → a category: converts it between the two — a deliberate, symmetric, two-way feature. **Both directions show a brief undo toast** ("Converted to weekly task — tap to undo") rather than a confirmation popup, so dragging stays fast but nothing is silently unrecoverable.
  - Weekly Task → a specific day block: see Phase 2 for exactly what this does to that task's planned/completed state.
  - Each drop writes to the database immediately. Needs a drag-and-drop library — already built (dnd-kit).
- Scheduled generation: pg_cron (converted from 7:00 America/Edmonton) + pg_net → Edge Function builds the brief and stores it in a `daily_briefs` table so opening the app is instant.

**Follow-up fix round — current build status:**
- ✅ Built: Priorities dropdown, `scheduled_time` bookings, cross-panel drag-and-drop core (dnd-kit), calendar date-picker.
- ⚠️ Needs verification, not yet trusted: dragging a Weekly Task onto a single day — confirm it marks only that day "planned" per Phase 2, not the whole recurring pattern.
- 🔁 Needs reworking, not removing: task↔Weekly Task drag conversion exists but is currently one-way and destructive (deletes the original task, no undo). Rework per the bullet above: both directions, with undo.
- ❌ Not yet built: categories color + pencil editing, Upcoming Days as a horizontal 4-block row, preview-before-send breakdown, scheduled/not-scheduled tag, tomorrow's-schedule-setup icon with blocked windows.
- 🗑️ Dropped from scope entirely — do not build: a separate "daily tasks" system. Folded into Weekly Tasks.

**Done when:** tasks can be created/edited/completed by typed or dictated natural language (via the preview-before-send flow, editable before commit) AND by manual forms; the brief renders each morning with correct local-time logic; category tags and scheduled/not-scheduled status are visible on every task.

## Phase 2 — Weekly tasks + journal

(Renamed from "Habits" — recurrence is more flexible than a simple streak. Naming may change again later; cheap to rename, not structural.)

- Tables: `weekly_tasks` (id, name, time_section nullable, recurrence_mode enum: `count` or `fixed_days`, target_per_week int 1-7 nullable — used when mode is `count`, scheduled_days int[] nullable — 0=Monday..6=Sunday, used when mode is `fixed_days`, created_at), `weekly_task_checkins` (id, weekly_task_id, date, status enum: `planned` or `completed`, note nullable, duration_minutes nullable), `journal_entries` (id, date, entry_time time, raw_transcript, cleaned_text, tags).
- **Creating one asks which mode fits:** a set number of times with any day working ("4 times a week"), or specific fixed days ("Monday, Wednesday, Friday"). "Every day" = `fixed_days` with all 7 selected.
- Weekly task display: **7 cubes, Monday first through Sunday last, each cube's state fully independent of the others.** Three states: empty (not scheduled that day), light green (`planned`), full/dark green (`completed`). A cube only darkens when that specific day happens and gets checked off — other cubes stay wherever they already were (e.g. Monday can be fully dark while Wednesday and Friday are still light).
- **How cubes get planned, per mode:**
  - `fixed_days`: scheduled weekdays light up automatically at the start of each week, no dragging needed — the pattern is already known (e.g. "gym, Mon/Wed/Fri" lights Monday/Wednesday/Friday every week on its own).
  - `count`: no fixed pattern, so planning is manual — dragging the task onto a specific day block creates a `planned` checkin for that date, lighting just that cube. Drag onto several days across the week to plan multiple at once.
  - Either way, checking it off on the actual day updates only that day's row to `completed`.
- **Progress note shows the full breakdown, not just a leftover count** — target, planned, completed, and however many still need planning, e.g. *"Target: 3x/week · Planned: 1 · Completed: 1 · 1 more to plan."* Numbers must always be internally consistent (planned + completed + remaining-to-plan = target).
- **Shows up in the actual daily schedule, not just its own tab:** `fixed_days` tasks appear in Today's schedule / Priorities on their scheduled weekdays, in their `time_section`. `count`-mode tasks appear in Today's schedule every day the week's target isn't met yet, and stop appearing once reached.
- Each check-in OFFERS an optional detail (note and/or duration) — one tap to skip, never required.
- **Journal — one log per day, not a flat list of entries.** One Journal tab overall; each day has its own log inside it. Multiple captures in a day (e.g. three separate voice notes) all live inside that same day's log, each shown with its own `entry_time` timestamp and its own cleaned text — not scattered as separate standalone entries.
- Journal: paste/dictate raw text → Edge Function → Claude produces cleaned_text; BOTH raw and cleaned stored and viewable. Cleaning rewrites for coherence only — never adds content, never changes meaning.
- **Keep it visually small and low-priority in the layout** — quick-capture utility, not a core feature. Must never render hidden behind another panel — this was seen overlapping the Alberta Premium Coatings section live in the app despite Phase 2 not officially having started; verify it's actually resolved, don't assume the existing spec line already caught it.

**Done when:** a rambling dictated entry produces a faithful cleaned version with the raw kept, correctly grouped under that day's single log with a timestamp; the 7-cube week resets correctly on Monday with each cube's planned/completed state independent and accurate for both recurrence modes; the progress note's numbers always add up; journal renders compactly with no layout overlap.

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

Deliberately separate from Phases 1–7. Don't chase pixel-perfect matching after each individual phase above — the layout will keep shifting as panels get added, so judging it early wastes effort. This is the one dedicated pass, once there's enough real content on screen (tasks, habits, jobs, finance, pace, maintenance, weather) to actually judge against Olive Dashboard v3 (see CLAUDE.md's Design direction — sidebar, forest green, orb, category sections).

- Use the UI/UX Pro Max skill + the v3 reference files together to bring the full dashboard in line: orb placement, sidebar, panel spacing, which panels deserve more visual weight, spacing rhythm.
- This is a styling pass on existing components, not a rebuild — same "modify, don't rebuild" instruction as before applies.
- **Done when:** the dashboard, with all Phase 1–7 content present, genuinely resembles Olive Dashboard v3 — not before, since there isn't enough content to compare against until this point.

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

**Another later idea, not decided:** a dedicated Groceries feature — an actual list with items, not just a task category. Explicitly parked, not part of any current phase.

## Open questions — blocked until answered

- **Q1:** Pay sheet link + which tabs/columns hold job name, labor type, and pay. Structure must come from the real sheet. (Blocks Phase 5.)
- **Q2:** Which bank(s) to link — personal only, or PowerPlay business account too? Verify Plaid CA coverage for the specific institution(s) before Phase 6.
- **Q3:** STT engine for Telegram voice notes — default suggestion: OpenAI Whisper API (cheap, accurate); decide before Phase 8.


Resolved: Google Calendar confirmed as the live calendar (Phase 4 unblocked). Daily total = balance + today's spending. Habits = check-off + streaks with optional per-check-in note/duration. TTS engine = ElevenLabs (Phase 9).
