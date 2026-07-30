# Build Plan — Olive v1

Phased spec. Each phase ends with a working, usable app. HARD GATE between phases: finish the phase, then stop and wait for the user to test the "Done when" condition and explicitly say to continue. Never begin the next phase without that approval. Phases marked **BLOCKED** have open questions (bottom of file) — do not build them until answered.

---

## Phase 1 — Tasks + daily brief (no external integrations)

The core loop, using only Supabase and the Anthropic API.

- Scaffold: React + Vite + Tailwind PWA, Supabase project, single-user email auth, RLS.
- Tables: `categories` (id, user_id, name, color hex, created_at — seeded: Personal = blue, PowerPlay Customs = yellow, Alberta Premium Coatings = a true/pure green, distinct from Olive's own signal-green HUD accent — user can add more anytime, by voice or in the UI, this is NOT a fixed enum), `tasks` (id, user_id, title, description nullable text, category_id references categories, due_date nullable, scheduled_time nullable time — set only when the task is a fixed-time booking/appointment, distinct from the flexible `time_section`, status, priority_weight, duration_minutes nullable, time_section enum: morning/midday/afternoon/evening/night/anytime nullable — see CLAUDE.md for the 1:30 AM day-rollover rule and the 6-part sequence Night is part of (previous night → morning → midday → afternoon → evening → that day's own night), auto_carry_forward boolean default true — if not completed by day-rollover, re-appears on the next day in the same time_section, repeating until done; false means it just stays overdue instead, created_at, completed_at), `memories` (id, user_id, content, date nullable, tags, created_at).
- Chat input box (works with Wispr Flow dictation as plain text): natural-language create/edit/complete/delete of tasks via Edge Function → Claude → validated JSON.
- **Preview-before-send, as a pop-up modal, voice-only.** After a voice capture is parsed, a centered modal (with backdrop) shows exactly what was understood — not yet saved. Typed text does NOT trigger this modal, since it's already visible/correctable as you type it; this is specifically a check on voice transcription and parsing. Three actions in the modal: pencil icon to edit any field directly, X to discard with nothing created, "Send off" to actually commit it. Applies to voice capture everywhere it's used (tasks, jobs later, weekly tasks) — a shared pattern, not a one-off.
- Task list UI grouped by category; manual add/edit/delete as forms too (voice is not the only path). User can change a task's `time_section` and `duration_minutes` directly.
- **Category tags:** every task shows a small colored corner tag with its category's color and name. A categories section lists all of them with a pencil icon each, to rename or recolor.
- **Dedicated per-category sections on the Dashboard:** one panel per category (Personal, PowerPlay Customs, Alberta Premium Coatings, and any the user adds later), each listing only that category's own tasks, with a colored left-edge accent matching the category. Must scale with however many categories actually exist — don't hardcode three.
- **A separate "Tasks" sidebar tab** for full task management (all tasks, all time, filterable by category/status/scheduled), distinct from the Dashboard's glanceable Today view.
- **Item editing:** clicking an existing item directly opens an edit modal scoped to just that item, with every real, relevant field editable — click "Gym" under Weekly Tasks to change its frequency/planned days; click a task under any category section to edit title/category/due date/booked time/part-of-day/duration/priority. Delete lives inside the modal (two-tap confirm), not as a separate icon on the row.
- **The top-corner pencil is a single ON/OFF toggle for "add mode" — drag/reposition/resize has been REMOVED entirely (tried, too complex for the value, cut deliberately). Layout is fixed per the arrangement above, not user-rearrangeable.**
  - **While ON:** each relevant section header (Weekly Tasks, each category panel, Today's Schedule) shows a small "+" button for adding a new item directly into that section. **Today's Schedule specifically:** adding a task this way includes a checkbox, checked by default, labeled "If not completed, add back tomorrow" — if left checked and the task isn't done by the day-rollover, it automatically carries forward to the next day's schedule, in the same time_section spot, repeating each day until actually completed. Unchecking it means no safety net — if it's not done, it just sits overdue on its original day, doesn't duplicate forward. This carry-forward behavior is a real field on the task (`auto_carry_forward` boolean, default true), not exclusive to this add flow.
  - **While OFF:** the "+" buttons aren't visible — clean view.
  - **Editing an existing item** (click a task, weekly task, or category directly) is NOT gated behind this toggle — always available either way, opens a full edit modal for every real field on it.
  - **Do not build or leave in place any drag-to-reposition-sections or horizontal-resize-sections logic.** If it exists from a prior attempt, remove it rather than leaving dead/broken code.
- **Dashboard layout — fixed arrangement, NOT user-rearrangeable. Supersedes all earlier layout versions:**
  - **Center unit:** the orb (full size — no need to shrink it) directly above the capture/talk box, stacked as one vertical unit.
  - **Left flank, running alongside the full height of the center unit:** Active Tasks (shows ONLY tasks relevant to the current part of day — e.g. midday tasks display at midday). Each item shows its description directly, always visible, no click needed — and larger per-item spacing than other panels, since this is meant to be glanced at, not compact. Each item also gets a checkbox to mark complete right there in this panel, not just via the edit modal. If Active Tasks doesn't reach the same height as Today's Schedule on the right, Active Jobs fills the remaining space directly below it, so the left flank's total height matches the right flank's. **This Dashboard mini-panel gets a bit more room and per-job description too** — not as much detail as the full Active Jobs tab/pop-up, but more than a bare name-and-status line.
  - **Right flank, same height as the left, spanning the full height of the center unit:** Today's Schedule — full length, the full day, all time sections, following the 6-part sequence below. **Each section label shows its actual clock time range** — e.g. "Morning · 7:00 AM–12:00 PM" (dynamic, based on that day's wake_time), "Midday · 12:00–4:00 PM" (fixed), "Afternoon · 4:00–6:00 PM" (fixed), "Evening · 7:00–11:00 PM" (fixed), "Night · 12:00–5:00 AM" (fixed) — not just the bare label. Each task shows a small dropdown/chevron button to reveal its description inline, collapsed by default — pressing it expands the description without opening the full edit modal. This is separate from clicking the task itself, which still opens the full edit modal as normal everywhere else.
  - **Below the entire flanking row, edge to edge (full width, not just centered):** Finance — slightly thicker/taller than a standard panel.
  - **Below Finance, left side:** Weekly Tasks.
  - **Below Finance, right side, stacked top to bottom:** Upcoming Days → Journal (Active Jobs is NOT here — it moved to the left flank above).
  - **Below that, full width, compact/thin:** Priorities — deliberately deprioritized and visually slim, not removed.
  - **Bottom of the page, full width:** the three category panels (Personal, PowerPlay Customs, Alberta Premium Coatings).
  - On mobile: single column, same top-to-bottom order; category panels move to their own Tasks-tab view to keep the scroll manageable.
- **Sidebar navigation:** Dashboard, Tasks, Weekly Tasks, Active Jobs, Journal, Finance, Groceries (reserved nav slot only — no feature behind it, do not build), Settings.
- **Scheduled / Not scheduled indicator** on every task regardless of category: "Scheduled" if `due_date` is set, "Not scheduled" if not.
- Due date picker: proper popup mini calendar — already built, no further work needed.

**Tomorrow's schedule setup (replaces a nightly auto-prompt):** a manual icon, "Set up tomorrow's schedule," showing Completed/Uncompleted. Tapping it opens a **proper form in a popup, centered or top of screen (not wherever it currently renders)** — not just a free-text blurb box:
- Wake-up time (time input)
- Bedtime (time input)
- Blocked windows (free text/voice, e.g. "dentist 2 to 3:30")
- "Planning to go selling" checkbox
- **A task adder right inside this same popup** — add tasks for tomorrow directly here, by voice/mic (same capture pattern as the main capture bar) or typed, not a separate flow you have to leave this popup for.

All of this parses into a `daily_schedule_setup` row (date, wake_time, bedtime, blocked_windows jsonb, going_selling boolean).

**Bedtime rule of thumb:** if the bedtime given the night before is later than 11:00 PM, that next day's Morning tasks are automatically removed from the Morning slot, and the user is prompted whether to move them to another time of day. This override applies to that single day only, not a standing change.

**Time-section boundaries — corrected: only Morning is relative to wake_time, the rest are fixed clock times, not wake-time-relative:**
- Morning: wake_time → 12:00 PM
- Midday: 12:00 PM – 4:00 PM
- Afternoon: 4:00 PM – 6:00 PM
- Evening: 6:00 PM – 11:00 PM (extended from 7 PM to close the 6–7 PM gap — resolved, no longer open)
- Night: 11:00 PM – 5:00 AM (extended from 12:00 AM to close the remaining gap)
- **Resolved:** 6:00–7:00 PM now folds into Evening (see above). One small gap remains — 11:00 PM–12:00 AM — folding this into Night (Night becomes 11:00 PM–5:00 AM) rather than asking a third question about a single hour; flag it if that's wrong.

The pulled-forward-task logic avoids suggesting anything into blocked windows.

(No separate "daily tasks" system — anything that happens every day is just a Weekly Task set to all 7 fixed days. See Phase 2. Do not build a standalone daily-tasks table.)

- Daily brief screen: today, plus an **Upcoming Days** row — today + next 3 days shown as **4 blocks side by side horizontally**, not stacked. Chronological from today. *(Reverted — the 3-behind/7-ahead treatment below was meant for Weekly Tasks, not this panel; that was a misattribution.)*
- **Day-rollover countdown**, top corner: a live counter showing time remaining until the next day-rollover (1:30 AM).
- **Day navigation on Today's Schedule / Active Tasks: bidirectional, not just backward.** A button to step the detailed view backward, up to 3 days — labeled dynamically ("Previous day," "Two days ago," "Three days ago") — AND forward into future days as well, not just back. Whatever day is selected shows its full real task data, not a placeholder. Distinct from the Upcoming Days overview row above — this actually switches which day's full schedule is showing in the detailed panels, not just glancing at a block.
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
- Weekly task display: **7 cubes, Monday first through Sunday last, each cube's state fully independent of the others.** Stays a fixed Monday-through-Sunday calendar week — no rolling window. **Row layout: task name on the left, the 7 cubes on the right — a single horizontal row, not stacked with the name above and note below.** Cubes stay the same (larger) size as the current build, but must be genuinely square, not stretched into rectangles — and each still labeled with its actual date (e.g. "MON 7/21"). More space-efficient than the stacked version. A small header shows the week's date range (e.g. "Week of July 21–27"). Three states: empty (not scheduled that day), light green (`planned`), full/dark green (`completed`). A cube only darkens when that specific day happens and gets checked off — other cubes stay wherever they already were (e.g. Monday can be fully dark while Wednesday and Friday are still light). **Cube clicks depend on add-mode (the top-corner pencil): with the pencil OFF (default), clicking a cube just marks that day complete. With the pencil ON, clicking a cube instead lets you edit/move it — for fixed-days tasks, toggles that day in/out of `scheduled_days`.** Two different actions gated by the same toggle used everywhere else in the app.
- **Today's Schedule has a small area with two distinct buttons, not a general "incomplete task" reminder mixed together:**
  - **"Unplanned Weekly Tasks"** — count-mode weekly tasks that still need days planned this week (the existing nudge, just reframed as its own explicit button, not passive text). Disappears once fully planned. Resets each Monday.
  - **"Carryover Tasks"** — one-off regular tasks that weren't completed yesterday and had `auto_carry_forward` checked, so they rolled forward. This is NOT a general "you didn't finish this" reminder system — only tasks that explicitly opted into carrying forward land here.
  - These are two separate, clearly distinct things — don't conflate weekly-task planning with one-off task carryover.
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

- Table: `active_jobs` (id, name, description nullable text, status enum: quoted/sold/in_progress/paid, category_id references the same `categories` table as tasks — this is the job's "header," e.g. Alberta Premium Coatings vs PowerPlay Customs vs any custom category, price nullable numeric, payment_type nullable text (e.g. cash/e-transfer/cheque — not a fixed enum, keep it flexible like categories), completion_date nullable timestamptz, deadline nullable date, pinned boolean default false, sheet_row_ref nullable, created_at, updated_at, notes nullable).
- Natural-language capture: "add a job, Dennis's driveway" / "mark the Flames job paid." A job is created with a name (the specific job, e.g. "Jordan's driveway") and a category/header (which company or custom category it falls under).
- **Job-linked sub-tasks:** add a nullable `job_id` (references `active_jobs`) to the `tasks` table. A task tied to a job is a completely normal task otherwise — same due date, time_section, scheduled_time, drag-and-drop between panels and days — just additionally scoped to that job, so it can be viewed either on the job itself or wherever tasks normally show up.
- **Auto-optimized task wording:** when adding a task to a job, the user describes it in their own words and Claude polishes the phrasing into a clear, concise task title before it's saved (still goes through the existing preview-before-send voice modal so the user can see/edit the result, not silently rewritten).
- **Bigger graphics, more information on the main Active Jobs view** — not just name and status, enough to actually understand a job at a glance without opening it.
- **A detailed pop-up per job**, holding everything that isn't always relevant on the main list: description, price, payment type, completion date, deadline. Optional fields stay optional — not every job needs all of them filled in.
- **An AI chat box embedded inside that same pop-up** — the user can type or talk into it, and it parses what's said and fills in the job's form fields directly (price, payment type, status, description, etc.), the same underlying pattern as the main capture bar, just scoped to this one job's fields.
- **"Mark completed" button** — moves the job out of the main active view into a separate completed/archived section, doesn't just change its status quietly in place.
- **Auto-sorting by deadline urgency, with a visible tier** (e.g. urgent / soon / later) — jobs closer to their `deadline` sort higher and show their tier visibly. *(Best-effort interpretation of "different levels, automatically sorted" — confirm this is actually what was meant before treating it as settled.)*
- **Pin feature** — a job can be pinned to stay prominently visible regardless of sort order.
- Jobs appear in the daily brief (active count + anything that changed status yesterday).
- **Open, not yet specified:** an "uploading something" step was mentioned (possibly a photo or document attached to a job) but isn't detailed enough to build yet — don't invent specifics, ask if/when this becomes a priority.

**Done when:** jobs can be created and moved through statuses by voice/text and manually; a job's sub-tasks can be added, auto-worded, and scheduled/dragged exactly like any other task; the detailed pop-up (with embedded AI chat fill-in) works for price/payment type/completion date/description; completed jobs move to their own section; deadline-based sorting and pinning both work; brief includes jobs.

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

## Phase 6 — Finance agent (reads from YNAB, read-only)

**The division of responsibility, stated explicitly so it's never re-litigated:** YNAB is the system of record for the money itself — categorization, budgeting, payee management, all of it. Olive doesn't compete with that or rebuild it. Olive's job is to be the thing that already knows everything ELSE — your schedule, your jobs, your income pace, your tasks — and merge YNAB's data into that bigger picture. The value Olive adds is entirely in the cross-referencing (spend vs. income pace, a nudge landing in Today's Schedule instead of buried in a separate app) — never in re-doing what YNAB already does well. Any future work on this phase should be read with that framing, not as "build a finance feature" in isolation.

Switched from Plaid to reading directly from the user's own YNAB budget — YNAB already handles bank linking, categorization, and payee sorting, so Olive doesn't rebuild any of that.

- **YNAB Personal Access Token** (self-service — user generates it in YNAB's own Account Settings → Developer Settings, no approval process needed), stored server-side as a secret, same pattern as every other key.
- Daily sync into `finance_snapshot` tables (accounts, balances, transactions) pulled straight from the YNAB API — **transactions arrive already categorized and payee-matched by YNAB itself.** No Olive-side auto-categorization or merchant-memory build needed; that's YNAB's job now, not ours.
- **YNAB stays read-only from Olive, same as the Google Sheet** — Olive never writes a category correction back to YNAB. If a transaction is uncategorized in YNAB, Olive surfaces a reminder to go categorize it there, exactly like the Sheet's "reminder, not auto-write" rule. *(Flagging this as the default for consistency with the rest of the app — say so if you actually want Olive to write categories back to YNAB instead.)*
- **Uncategorized-in-YNAB transactions surface as a nudge in the Today's Schedule nudge area** (same pattern as Unplanned Weekly Tasks / Carryover Tasks) — a reminder to go categorize them in YNAB, not just something buried in the Finance tab.
- Recurring-charge detection, built on top of the synced transaction history — upcoming known charges appear in the brief N days ahead. **Also detect genuinely NEW recurring charges** (a pattern that didn't exist before starts repeating) — flagged distinctly, the "wait, when did I sign up for that" catch.
- **Dashboard mini-panel stays simple** (per the existing Dashboard/full-tab split pattern used elsewhere): balance, today's spend, pace vs goal only — no transaction list here.
- **Full Finance sidebar tab gets the real depth:**
  - **Recent Transactions** — shown with YNAB's own category and payee already attached.
  - Category breakdown for the period (where the money's actually going), using YNAB's categories as-is.
  - **Spend-vs-income-pace cross-reference** — combines the income pace tracker (Phase 7) with actual spending into one insight, something neither shows alone.
- Brief shows a daily money section: current balance + total spent today (confirmed definition).
- Staleness is first-class: if the YNAB token/connection breaks, show "data from <date> — tap to re-link," never silently-wrong numbers.

**Done when:** real balance + recent transactions render with YNAB's own categories intact; uncategorized-in-YNAB items nudge correctly in Today's Schedule; a known subscription is flagged before it hits, and a genuinely new one is flagged distinctly; a broken connection shows the stale-data state.
*(The old Q2 — which bank(s) to link — no longer applies to Olive's build; bank linking now happens on YNAB's side, outside Olive entirely. The user still needs their bank(s) actually linked within YNAB itself before this phase is useful.)*

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
