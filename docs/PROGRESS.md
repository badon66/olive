# Olive — Build Log (maintained by Claude, per CLAUDE.md file-ownership rule)

Spec source of truth: `docs/BUILD_PLAN.md` (replaced wholesale by Keenan's planning sessions — never annotated here).
This file tracks what's actually built, what's verified, and known gaps.

## Phase 1 — Tasks + daily brief ✅ built (one external blocker)

- Scaffold, Supabase project `dpkdsmvskryettdxcvpp`, single-user auth (signups disabled), RLS on all tables.
- Tables: `categories` (user-defined, seeded 3 with colors), `tasks` (category_id, due_date, scheduled_time, time_section, duration_minutes, priority), `memories`, `daily_briefs`, `daily_schedule_setup`, `dashboard_layouts`.
- NL capture: `assistant` edge fn (Claude tool-use → zod → Postgres), category-aware incl. voice-created categories; preview/commit modes.
- **Voice preview modal**: dictation-detected input parses first, shows the editable breakdown (per-field pencil, X discard, Send off).
- Brief: 7:00 America/Edmonton pg_cron (DST-proof dual firing + in-function guard, Vault-authenticated), on-demand fallback, priorities dropdown (overdue folded in), manual reorder persisted.
- Today's Schedule (time sections), Upcoming Days (today+3 ↔ full week), popup mini calendar, scheduled/not-scheduled tags, category corner tags.
- Tomorrow's-schedule setup icon → `schedule-setup` edge fn (wake time + blocked windows parsed; displayed on Today's Schedule).
- Cross-panel drag-and-drop (dnd-kit): task→section/day-block/priorities-reorder; task↔weekly conversion both ways with undo toast.
- **Customize mode**: pencil is a plain ON/OFF toggle that ONLY reveals "+" add buttons on section headers (Weekly Tasks, each category panel). Nothing else.
- **Dashboard layout is FIXED** (not user-rearrangeable), per BUILD_PLAN rows 1–6: Active Tasks | orb | Today's Schedule flanking at equal height → capture box centred under the orb → Finance centred below → Weekly Tasks (left) with Active Jobs/Upcoming Days/Journal stacked (right) → thin full-width Priorities → category panels at the bottom.
- **Active Tasks** panel shows only the current part of day (`currentSection()` in `lib/suggest.ts`, tested), distinct from the full Today's Schedule.

**Removed deliberately (do not re-add without a spec change)**: section drag-to-reposition and horizontal resize. `react-grid-layout` uninstalled, `DashboardGrid`/`useDashboardLayout`/`lib/dashboardLayout` deleted, RGL CSS removed, `dashboard_layouts` table dropped. Two prior attempts never worked; an automated drag test proved the library build in use (`react-grid-layout@2.2.3`) shipped **no pointer/mouse input binding at all** — `onMouseDown`/`onPointerDown`/`onTouchStart`/`addEventListener` appear nowhere in its dist, so no configuration could ever have made it drag. Item-level task drag-and-drop between panels (dnd-kit) is a separate feature and still works.
- Sidebar-only navigation (Dashboard/Tasks/Weekly Tasks/Active Jobs/Journal/Finance/Groceries/Settings; last four reserved placeholders).

**Blocked, not code**: live NL capture + journal cleaning need Anthropic API credits (key is valid, in Vault; account balance is $0 — console.anthropic.com → Plans & Billing).

**Recently closed**:
- ✅ Suggested-schedule pull-forward (`src/lib/suggest.ts`, 8 tests): unscheduled tasks fill sparse, unblocked time sections in Today's Schedule using `duration_minutes` (120-min soft cap, 30-min default). Rendered dimmed with a "pulled forward" chip — never blended with due-today items; dragging one commits it. Blocked windows (from `daily_schedule_setup`) are skipped via fixed section clock ranges.
- ✅ Tasks-tab filters: category / status (open·completed·all) / scheduled·not-scheduled, with a reset + count. Dashboard TaskList unaffected (`filterable` only on the Tasks sidebar tab).

**Known gaps (deliberately not built yet)**:
- Wake-time-shifted section boundaries (sections are labeled buckets, not clock-anchored). Pull-forward's blocked-window detection uses fixed clock ranges (morning 5–11, midday 11–14, afternoon 14–17, evening 17–23) as a stand-in until this lands.
- "Hold-and-drag" for sections = 6px movement threshold, not a timed hold (react-grid-layout has no hold delay).
- Customize drag/resize is desktop-only; mobile pencil reveals "+" adds only.

## Phase 2 — Weekly tasks + journal ✅ built

- `weekly_tasks` (count vs fixed_days modes, target_per_week, scheduled_days, time_section), `weekly_task_checkins` (planned/completed, note, duration).
- 7 independent Mon-first cubes (empty/planned/completed); fixed days auto-light weekly; count mode planned by cube-tap or day-block drag; progress note with consistent arithmetic (unit-tested incl. week/year boundaries).
- Schedule integration: fixed_days appear on their weekdays, count-mode until target met.
- Check-off offers optional note/duration, one tap to skip.
- Journal: one log per day with entry_time per capture; raw→cleaned via `journal-clean` edge fn (coherence-only), both stored, save-raw fallback when API unavailable, re-clean later, editable (raw never editable).

## Day model (updated 2026-07-26 — supersedes the earlier 7 AM version)

- **The day rolls over at 01:30 America/Edmonton for the page/view, and separately at 05:00 for which Night is still active.** See the "TWO day boundaries" section at the bottom — do not collapse them. `VIEW_DAY_START_MINUTES = 90` / `ACTIVE_DAY_START_MINUTES = 300` in `src/lib/dates.ts`; `edmontonMinutes()` gives minutes since local midnight. Mirrored in the edge functions (`_shared/brief.ts`, `assistant` `edmontonToday`, `schedule-setup` `edmontonTomorrow`) so client and server agree. Separate from `wake_time`. Tested in `dates.test.ts`.
- **Today's Schedule is a straight 5-part ribbon.** `SCHEDULE_SLOTS` in `src/lib/sections.ts` renders, in order: Morning → Midday → Afternoon → Evening → **Night**, plus an **Anytime** row appended only when it holds something. Night appears **once**, at the end. (The old build bookended the day with a leading "Night · earlier" slot; that only existed to paper over the 1:30 AM boundary cutting Night in half, and was removed with the 5 AM fix.) `partitionSchedule(dueToday)` (unit-tested) just drops each task into its own `time_section`; a null section is Anytime. Overdue daytime tasks still surface in their own section (e.g. a 3-day-overdue morning task stays under Morning). The whole ribbon advances automatically because it's fed `today` (which flips at 5 AM) — no per-slot clock. Verified in a running browser via a throwaway harness (now deleted).
- Greeting subtext is a real insight (`src/lib/insight.ts`): next booked appointment → else top-priority item in the current part of day → else due/overdue state, plus a done/total stat.

## Drag/resize/rename audit (2026-07-26)

- Confirmed **no** section drag/resize/rename code exists anywhere. `react-grid-layout` is uninstalled, the `dashboard_layouts` table is dropped, and only historical migration references remain (correct). BUILD_PLAN.md's leftover "Customize layout mode" bullet was stale spec, not an implemented feature. Item-level task drag (dnd-kit, tasks between panels) is intentionally kept and is unrelated.

## Phase 3 — Active jobs log (built 2026-07-26, awaiting Keenan's signed-in test)

- **Schema** (`migrations/20260726000001_phase3_active_jobs.sql`, applied live): `active_jobs` (name, `job_status` enum quoted/sold/in_progress/paid, nullable `category_id` header, `sheet_row_ref` reserved for Phase 5, `notes`, `created_at`, `updated_at` with a touch trigger) + a nullable `tasks.job_id` FK (`on delete set null` — deleting a job un-scopes its tasks, never destroys them). Types regenerated into `database.types.ts`.
- **Pure logic** `src/lib/jobs.ts` (7 unit tests): `JOB_STATUSES` order, labels, `isActiveStatus` (all but paid), `activeCount`, `sortJobs` (stage asc then most-recent), `groupByStatus`, `changedOn` (buckets `updated_at` by the 1:30 AM Edmonton view-day).
- **Assistant** (deployed v6): new `create_job` / `update_job` actions + `job_id` on create/update_task; ACTIVE JOBS list in the prompt so "mark the Flames job paid" resolves to a job. Job-scoped capture: a job's own box passes a `job` context → the model rewrites the user's words into a clean task title and the server stamps `job_id` (survives preview→commit). Voice/global-bar job actions render/edit in the existing preview modal.
- **UI**: `useJobs` hook; **Active Jobs** dashboard panel (left flank, live non-paid count, tap → tab); live **Active Jobs** sidebar tab (`JobsView`) — create/edit via `JobForm`, inline status pills, notes, job-scoped sub-tasks (real `TaskCard`s), per-job auto-wording capture (`ChatBar` with a `job` prop that always previews). Job sub-tasks are normal tasks, so they also appear/drag in Today's Schedule and category panels.
- **Brief**: `buildJobsBrief` adds `jobs: { active, changed }` to the daily brief (deployed daily-brief v5); "changed" = `updated_at` on yesterday (proxy — no status-history table). Rendered in the mobile `BriefView`; desktop shows the live panel.
- **Judgment calls (flagged, not blocking):** `category_id` nullable so capture never guesses a wrong company; "changed yesterday" approximated by `updated_at`. The BUILD_PLAN "uploading something" idea was deliberately left unbuilt (spec says not yet specified).
- **Verified**: `npm run check` clean (72 tests); Jobs UI mounted in a throwaway harness (deleted) — accessibility tree confirmed grouping, active-only panel, headers, sub-tasks, per-job capture. Data flows (create/update/auto-word) need Keenan's signed-in test.

## Post-Phase-3 UI tweaks (2026-07-26)

- **Task `description`** (nullable text, migration `20260726000002_task_description.sql`): editable in `TaskForm`, settable by the assistant (v7), and shown by `TaskCard`'s new `descriptionMode` prop — `"always"` in Active Tasks (inline, no click), `"chevron"` in Today's Schedule (a toggle reveals it without opening the edit modal), `"none"` elsewhere. Clicking the task still opens the edit modal everywhere.
- **Customize pencil bug (fixed):** the pencil was rendered in `App.tsx` as `absolute top-4 right-10 z-30` inside `<main>`, *before* `{inner}`. The Dashboard's sticky header (`z-30`, `bg-void/85 backdrop-blur-md`) came later in the DOM, so at equal z-index it painted over the pencil and ate its clicks — the header's `pr-20` only cleared its text, not its background/stacking. Fix: the pencil now lives *inside* the sticky header as a real flex child; the App-level absolute pencil is kept only for non-dashboard tabs (no sticky header there). Verified: clicking it toggles customize mode.
- **Header spacing:** dashboard content container gained `pt-5` below the sticky header.
- **Active Tasks:** bigger per-item spacing (`py-3` weekly / `py-1` task wrappers), and every item is completable in-panel — tasks via `TaskCard`'s ring (already present), weekly items via a new check-off wired to `completeDay`/`uncompleteDay`.

## Schedule/weekly refinements (2026-07-27)

- **Upcoming Days** — the 11-block 3-behind/7-ahead window was a **misattribution and has been reverted** (2026-07-27): back to today + next 3 days = 4 horizontal blocks with the "full week" expand toggle. Each block caps at 4 tasks then "+N more" and scrolls internally, so a heavily-planned day never stretches the row. (`balancedDates`/`fullDateLabel` removed.)
- **Rollover countdown** (`RolloverCountdown.tsx` + `secondsUntilRollover`/`formatCountdown`, tested): live H:MM:SS to the next 1:30 AM page flip, in the sticky header.
- **Previous-day navigation** on Today's Schedule (`DayNav` in TodaySchedulePanel; `scheduleOffset` in DesktopDashboard): step back up to 3 days ("Today"/"Previous day"/"Two days ago"/"Three days ago"). A past day renders a read-back grouping of that day's tasks by section — no pull-forward/weekly/drag. **Scope note:** applied to Today's Schedule only; Active Tasks stays the live "right now" panel (a past "right now" is meaningless).
- **Fixed-days cubes edit the pattern** (`onCube` in WeeklyTasksView): clicking any non-today cube toggles that weekday in/out of `scheduled_days` directly. **Judgment call:** today's cube stays a completion toggle (so tab check-off still works); edit today's weekday membership via the modal.
- **Weekly Tasks cubes redesigned** (2026-07-27): stays a fixed Monday–Sunday week (no rolling window). Layout is a **single horizontal row — task name (+ chips) on the left, the 7 cubes on the right**; cubes are large but genuinely **square** (`w-14 h-14`, 56×56, not stretched), each labeled with its weekday + real date ("MON 7/27"); progress note sits below. Week-range header on top ("Week of July 27 – August 2" via `weekRangeLabel`, tested, month-crossing aware). More space-efficient than the earlier stacked version (~97px/task vs ~124px).
- **Count-mode "to be planned this week" nudge** now also surfaces in Today's Schedule (top), one line per count task with `toPlan > 0`, gone once fully planned.
- **Non-Dashboard pages** (Tasks/Weekly/Journal/Finance/Settings) now use full viewport width with scaling padding (`px-6 lg:px-10`, no `max-w` cap) per CLAUDE.md line 29; placeholders enlarged and centred.
- **Time-section clock-range display (item 7): NOT built — blocked.** No prior code renders per-section clock times anywhere (the ranges live only in `suggest.ts` logic, and are stale vs the spec). BUILD_PLAN line 49 flags the section boundaries as an unresolved open question (6–7 PM and 11 PM–12 AM uncovered), so building section time labels needs that gap resolved first. Journal `entry_time` and task `scheduled_time` timestamps already render. Awaiting the user's clarification on which "timestamps" they meant.

## Schedule/weekly round 2 (2026-07-27)

- **Migration** `20260727000001_carry_forward_and_setup.sql`: `tasks.auto_carry_forward` (bool), `daily_schedule_setup.bedtime` (time) + `.going_selling` (bool). Types updated.
- **Weekly cube clicks gated by the pencil** (`customize`): OFF (default) = mark that day complete; ON = edit/move — fixed-days toggles `scheduled_days`, count-mode plans/unplans. `customize` threaded into `WeeklyTasksView` from all three call sites.
- **Bidirectional day-nav** on Today's Schedule: back up to 3 days, forward up to a week (`dayOffsetLabel`, e.g. "Previous day"/"Next day"/"In two days"). Any non-today day shows its real due tasks as a read-back grouping (nudges/pull-forward/weekly hidden).
- **Two distinct nudge buttons** (`NudgeButton` in TodaySchedulePanel), never conflated: **Unplanned Weekly Tasks** (count tasks with `toPlan>0`) and **Carryover Tasks** (open `auto_carry_forward` one-offs that went overdue — excludes plain overdue). Each expands its own list; carryover items click through to the edit modal. `auto_carry_forward` checkbox added to TaskForm + the assistant (v8).
- **Tomorrow's-schedule-setup rebuilt as a real form** (`ScheduleSetup.tsx`, centered/top): wake + bedtime time inputs, blocked-windows text/voice (parsed by `schedule-setup` v4), "Planning to go selling" checkbox, and an in-popup task adder (`ChatBar` with a new `forDate` prop → assistant defaults undated tasks to tomorrow). Empty blurb on update preserves existing blocked windows.
- ~~Not built this pass: the bedtime rule and the carryover auto-roll~~ — **both built 2026-07-28, see below.**

## Bedtime rule + carryover rollover cron (2026-07-28)

- **Bedtime rule** (`isLateBedtime` in `src/lib/dayrules.ts`, tested): a bedtime later than 11:00 PM on the night before a day clears that day's **Morning** slot. Small-hours bedtimes (00:00–04:59) count as late even though they sort lower as strings; 5:00 AM is the cutoff, matching the resolved Night boundary. 11:00 PM exactly is not "later than".
  - **Non-destructive by design:** nothing is written automatically. The Morning slot renders "Cleared — late night", and the displaced tasks appear in a prompt above with one-tap Midday/Afternoon/Evening/Night/Anytime buttons — only that tap writes `time_section`. That's what makes it a single-day override rather than a standing change to the task.
  - **Which row's bedtime:** the setup row for day *X* holds X's wake AND X's bedtime (the bedtime at the *end* of X), so day D's morning is governed by row **D-1**'s bedtime. Applied to the live ribbon for whichever day is displayed; the read-back view of other days is left alone.
- **Carryover now actually rolls forward** — new `carry-forward` edge function (v1, JWT off, cron-secret auth like daily-brief) + pg_cron job `olive-carry-forward` at `0 11,12 * * *` UTC (= 5:00 AM MDT/MST), gated to a 60-minute window after the rollover so exactly one firing per day acts. Idempotent.
  - Migration `20260728000001`: `tasks.carried_forward_on` (date, partial index). **Why it exists:** bumping `due_date` to today makes a task stop being overdue, which would have silently emptied the "Carryover Tasks" nudge. The stamp keeps it visible on the day it landed.
  - `carryoverTasks(open, today)` (tested) selects: opted-in tasks stamped for today, OR opted-in tasks still overdue (the fallback when the cron hasn't run / is down). Never plain overdue tasks.
- **Verified:** cron wiring exercised end-to-end via `net.http_post` from SQL — Vault URL + secret resolved, function returned 200 and correctly declined with "outside the rollover window" (it was mid-afternoon). The bump's SQL semantics were proven in a **rolled-back transaction**: opted-in overdue moved + stamped; plain-overdue, already-due-today, and completed all untouched; zero rows left behind. Carryover UI verified in a harness (both paths show, both non-qualifying tasks excluded).
- **Needs Keenan's signed-in check:** the cleared-Morning visual — the panel reads `daily_schedule_setup` directly, so an unauthenticated harness can't seed a late bedtime. The rule itself is unit-tested at its exact boundaries. To try it: set a bedtime after 11 PM for a day, then view the next day.

## Time-section clock-range display (2026-07-27)

- BUILD_PLAN's section boundaries were **resolved** (6–7 PM folds into Evening 6–11 PM; 11 PM–midnight into Night 11 PM–5 AM), unblocking the display. `sectionClockLabel(section, wakeTime)` in `sections.ts` (tested): Morning is wake-relative (`wake → 12:00 PM`, default 11:00), Midday 12–4 PM, Afternoon 4–6 PM, Evening 6–11 PM, Night 11 PM–5 AM, Anytime none. Rendered as a light suffix on every Today's Schedule section header (ribbon + past/future read-back), using the day's `wake_time`.
- **Note:** this is the informational header display only. The live "which section is it now" logic (`currentSection`/`pullForward` in `suggest.ts`) still uses its older fixed ranges (morning 7–11, etc.) — aligning that to the resolved boundaries is a separate, behavior-affecting change, not done here.

## Unified day nav, job panel, motion (2026-08-12)

- **Unified day navigation:** one shared `scheduleOffset` drives both the arrows and the Upcoming Days blocks — clicking a block navigates the detailed schedule to that day and highlights it. Navigator is `[←] [centre button] [→]`; the centre button jumps straight back to today from any position (disabled when already there). Header is dynamic: "Today's Schedule" → "Thursday, August 13th Schedule" (`fullDateLabel`, tested).
- **Left flank is a firm 50/50** (`basis-1/2 grow-0 shrink-0` on both) — Active Jobs no longer just absorbs the leftover. Verified 383px/383px.
- **Active Jobs panel entries are thicker:** header + category, clickable status chips, and a per-job task summary (upcoming/active/overdue) from `jobTaskStats` (tested). Status chips edit inline **without** the add-mode pencil — a deliberate exception to the pencil-gated pattern.
- **Job-scoped "+"** on each job entry in add mode → opens the task form pre-filled with that job (`For job: …` context line, `job_id` on submit).
- **Today's Schedule "+"** now opens the full task form (title, description, category, due date, booked time, part of day, mins, priority, carry-forward) with **due date defaulting to the day currently being viewed**. Carry-forward is checked by default on new tasks per BUILD_PLAN.
- **Motion/perf:** optimistic updates on task complete/reopen/edit and weekly check-off (instant paint, rollback on write failure); spring easing set via Tailwind's `--default-transition-timing-function` token (a plain CSS rule loses to the `transition-*` utilities — verified `cubic-bezier(0.34, 1.56, 0.64, 1)` computed on buttons). A cursor-follow glow was built and then **removed at the user's request (2026-08-12)** — don't re-add it.
- **Pop-up bug — root cause:** `.hud-panel` sets `backdrop-filter: blur(14px)` *and* `overflow: hidden`. `backdrop-filter` makes an element the containing block for `position: fixed` descendants, so the shared modal rendered inside a job card was anchored to the card and clipped — it *was* the shared component, its `fixed` was trapped. Fixed with a `Portal` (renders to `document.body`) applied to ChatBar's preview, TaskForm, and JobForm. Verified `parentElement === document.body`.

### ⚠️ Job status three-way split — migration written, NOT applied

- `supabase/migrations/20260812000001_job_status_three_dimensions.sql` adds `sale_status` / `work_status` / `payment_status` enums + `price`, **backfills every existing row** from the old flat `status` (quoted→quoted/not_started/unpaid; sold→sold/not_started/unpaid; in_progress→sold/in_progress/unpaid; paid→sold/completed/paid), keeps the old column commented as deprecated for rollback, and sets `tasks.auto_carry_forward` default to true.
- The mapping is encoded and tested in `src/lib/jobStatus.ts` (`fromLegacyStatus`, `jobStatusTriple`, `isActiveTriple`, `tripleSummary`) — `jobStatusTriple` reads new columns when present and falls back to the legacy one, so the UI can work either side of the migration.
- **Blocked:** the Supabase MCP server disconnected mid-session and there is no service-role key, DB password, or CLI token available locally (only the anon key, which can't run DDL). The migration must be applied before the UI is rewired to the three dimensions — until then the Active Jobs panel still reads/writes the legacy `status`, and price-at-creation is not yet in the job form.

## Reorder arrows, header navigator, Upcoming Days v2 (2026-08-12)

- **Task reordering moved off `daily_briefs.manual_order` onto `tasks.sort_order`** (migration `20260812000002`, applied). The brief-based version only worked on today and shared its order with the Priorities list; a per-task column fixes both. `orderBySortOrder` (placed tasks lead, untouched ones keep the bookings-first schedule sort) + `reorderSection` (swaps and renumbers the whole section, so a never-ordered section gets a complete order on the first nudge) — 11 tests.
- **Arrows are on every task, right-hand side.** Ends disable rather than vanish, so a single-task section still shows them (both disabled). Works on any day now, not just today. Optimistic via `taskStore.saveOrder`.
- **Day navigator moved into the "Today's Schedule" header, right side** — `DayNavigator`, a bordered `[←][today][→]` button group reading as part of the header. The in-body bar is retained only for standalone use (mobile brief) via `dayNav.inHeader`.
- **Upcoming Days redesigned:** 3-block base (yesterday / today / tomorrow), taller blocks listing that day's actual tasks with completion state (check dot + strikethrough + an "n/m done" line), dropped down from the header (`pt-2`). "+ more days" reveals the next 3 forward in a new row below, repeatable, with a collapse. Blocks still drive the shared day state and remain drop targets. Now takes all `tasks` (not just open) since completion is the point.

## Journal removed, Reminders built (2026-08-12)

- **Journal is gone, verified.** Deleted `JournalView.tsx`, `useJournal.ts`, `supabase/functions/journal-clean/`, `cleanJournal()`, the sidebar tab, the route, the dashboard panel, and the `journal_entries` types. Migration `20260813000001` drops the table — confirmed by querying `information_schema.tables`: **0 rows**. `grep -rn "ournal" src/` returns nothing. The deployed `journal-clean` edge function could NOT be deleted (this MCP has no delete-function capability), so it was **replaced with a 410 tombstone** that makes no Anthropic call and touches no data — remove it for real from the Supabase dashboard.
- **Reminders** (`reminders` table + `reminder_recurrence` enum, RLS, check constraint that rejects an incoherent shape). Sidebar tab (`RemindersView`) + compact dashboard mini-panel (`RemindersPanel`) in Journal's old grid cell, so it has its own cell and cannot overlap a neighbour.
  - `src/lib/reminders.ts` — `nextFireAt` / `isDue` / `dueReminders` / `describeRecurrence`, **26 unit tests** covering all five shapes including DST (wall-clock time holds across MDT→MST), month-length skipping (the 31st skips February rather than sliding), year rollover, and idempotent catch-up after a long gap.
  - Creation by voice/text via `create_reminder` in the assistant (**v9**), through the same preview-before-send modal.
  - `reminder-tick` edge function (v1, JWT off, cron-secret auth) + `olive-reminder-tick` cron every 5 min advances schedules server-side; in-app alerts (visual + short tone) fire while the app is open via `useReminderAlerts`.
  - **Honest limit, per spec:** off-app delivery is a Phase 8 (Telegram) dependency. Deliberately NOT faked with browser push. The tick keeps `last_fired_at`/`active` correct; it does not notify.
- **Today's Schedule header always carries the date** — "Today's Schedule — August 12th" on today, "Wednesday, August 12th Schedule" elsewhere (verified live).
- **Navigator taller** (32px → 40px buttons) and sitting in the header column on the right. **Upcoming Days blocks taller** (168px → 210px) for real per-task completion display.
- **Weekly tasks drag between time_sections** in Today's Schedule — this was already wired (`DraggableWeekly` + TaskDnd's `section:` handler + `setWeeklySection`); confirmed by code inspection, not re-implemented.

## Operational facts

- Secrets: `anthropic_api_key`, `cron_secret`, `project_url` in Supabase Vault via service-role-only RPCs; local copies in gitignored `.env`/`.env.local`.
- Edge functions: `assistant` (JWT ON, v11), `schedule-setup` (ON, v6), `reminder-tick` (OFF), `daily-brief` (OFF, v6), `carry-forward` (OFF, v2), `journal-clean` (410 tombstone — still needs deleting from the Supabase dashboard) — the JWT-off set check a cron secret or a user JWT in-function.
- Cron jobs (`cron.job`): `olive-daily-brief` `0 13,14 * * *`, `olive-carry-forward` `0 11,12 * * *` — both UTC pairs covering DST, each gated in-function so one firing per day acts.
- Tests: `npm run test` — dates, ranking, sections, weekly cubes, dashboard layout model.
- Preview quirks (for future sessions): the Browser-pane preview loses auth sessions on restart and screenshots can time out — Keenan's own browser at localhost:5173 is the real verification surface; signed-in checks need him.

## TWO day boundaries, not one (2026-08-13) — READ THIS BEFORE TOUCHING DATE LOGIC

This has now been got wrong twice, in both directions: first a single 1:30 AM
boundary, then (briefly, earlier the same day) a single 5:00 AM boundary. **Neither
is right. There are two boundaries and they are deliberately different.**

- **VIEW = 01:30** — "which day's page am I on". Header, default schedule view, day
  arrows, brief date, task lists, NL date parsing. `edmontonToday()`.
- **ACTIVE = 05:00** — "which day's Night is still running". Night is 11 PM–5 AM, so it
  stays attributed to the day it *started* on until it is genuinely over.
  `edmontonActiveDay()`. Used by Active Tasks and the current-section highlight only.

They agree except between 1:30 and 5:00 AM, where the page has moved on but the night
has not. **That disagreement is the specified behaviour, not a bug** — the two answer
different questions ("what page am I on" vs "what should I be doing right now").

- **`src/lib/dates.ts`** — `VIEW_DAY_START_MINUTES = 90` / `ACTIVE_DAY_START_MINUTES = 300`,
  with `edmontonToday()` and `edmontonActiveDay()` on top. The old single
  `DAY_START_MINUTES` export is gone so it can't silently be reused for both.
- **`src/lib/suggest.ts`** — `SECTION_RANGES` aligned to the resolved clock boundaries: morning `[5,12)`, midday `[12,16)`, afternoon `[16,18)`, evening `[18,23)`, night `[23,24) ∪ [0,5)`. `currentSection()` drives both Active Tasks' filtering and the new schedule highlight. (Three older `suggest.test.ts` cases were updated, not the code — a 14:00–15:30 appointment genuinely overlaps Midday under the resolved boundaries, not Afternoon.)
- **`src/lib/sections.ts`** — `SCHEDULE_SLOTS` collapsed 7 → 6 (leading "Night · earlier" deleted, all slots now droppable); `partitionSchedule` lost its `today` argument and its due-date routing, since there is no longer a second Night slot to route between.
- **`DesktopDashboard.tsx`** — derives BOTH: `today` (view) and `activeDay` (active).
  `today` drives `scheduleDate`/header/arrows; `activeDay` drives `activeDue`
  (`computeSections(open, activeDay)`) and `activeCardProps`, which is what
  `ActiveTasksPanel` receives. Also passed to `buildInsight` so the "Now: …" headline
  can't contradict Active Tasks in that window.
- **`TodaySchedulePanel.tsx`** — `isNow = shownDate === activeDay && nowSection === slot.section`.
  Keying off `activeDay` (not "is this today's view") is what makes the highlight land on
  the correct page during the 1:30–5:00 window.
- **`historical` redefined** — was `scheduleOffset !== 0`, now `otherDay && scheduleDate !== activeDay`.
  "Historical" must mean *genuinely over*. Without this, arrowing back to the still-running
  day between 1:30 and 5:00 rendered the read-back view, which has no section ribbon at all,
  so the highlight had nowhere to appear. Found by rendering it, not by reading it.
- **`RolloverCountdown.tsx`** — counts to the **1:30 AM** flip (the boundary the user
  actually watches happen — the page turning over).
- **Server side** — `_shared/brief.ts` exports both (`DAY_START_MINUTES = 90`,
  `ACTIVE_DAY_START_MINUTES = 300`, `edmontonToday`, `edmontonActiveDay`); `assistant` and
  `schedule-setup` use the 1:30 view boundary. **`carry-forward` deliberately gates on the
  5:00 ACTIVE boundary** — bumping due dates at 1:30 would yank the still-running Night out
  from under Active Tasks mid-night. Cron stays `0 11,12 * * *` UTC (= 5:00 MDT/MST).
  **Deployed:** assistant v11, schedule-setup v6. `daily-brief` and `carry-forward` were left
  at their existing versions: both run well after either boundary (brief at 7 AM, carry-forward
  in the 5 AM window), so the old and new constants give identical results for them.

**Verification — 1:00 AM vs 2:00 AM on the same night.** `dates.test.ts` covers both functions
across 11 PM / midnight / 1:00 / 1:29 / 1:30 / 2:00 / 4:59 / 5:00, including an explicit
`expect(view).not.toBe(active)` at 2:00 AM so nobody "fixes" the disagreement away.

Also rendered for real (throwaway harness, since deleted) with the dashboard's exact
derivation at both times:

| | page day | active day | Active Tasks | highlight on page | highlight one day back |
|---|---|---|---|---|---|
| 1:00 AM | Jul 7 | Jul 7 | last night's Night task | **Night** | Night |
| 2:00 AM | **Jul 8** | **Jul 7** | last night's Night task | none (correct — the 8th's Night hasn't started) | **Night** |

Full suite: **164 tests passing, 10 files, production build clean.**

## Phases 4–9 — not started (hard gate; explicit approval required)
