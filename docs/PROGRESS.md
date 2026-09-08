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

## Full-codebase audit — four parallel review agents + verified fix pass (2026-08-31)

Four read-only agents (dead code / performance / bugs / interface) swept the repo;
every claim was independently spot-checked against code, the live DB, and a
running browser before anything changed. 213 tests green before and after.

**Verified and FIXED (selected — commit messages carry the detail):**
- Pencil overlap (Known UI Bugs #4/#5, one shared root cause): the absolute
  `top-4 right-10 z-30` CustomizeToggle in App.tsx sat directly on "+ New job" /
  "+ New reminder" (measured 44×40px overlap; clicks hit the pencil). Now in
  normal flow above the page content.
- Cross-section arrow movement was DEAD CODE: ReorderArrows unconditionally
  disabled end presses, so the boundary branch (and its passing unit tests)
  could never fire from the UI. End arrows on task rows are now live when a
  neighbouring section exists; weekly rows still don't traverse.
- WeeklyTaskForm + its delete confirm and the ScheduleSetup popup were NOT
  portalled — trapped by backdrop-filter containing blocks (weekly modal
  measured 590×192 inside its panel; schedule-setup pinned to a 66px header
  strip). All portalled; weekly delete is now the same inline two-tap confirm
  as TaskForm.
- overdueFirst was silently defeated for any manually-nudged row (combineRows
  re-sorts placed rows by sort_order) — the lift now applies post-combine.
- Weekly occurrences were stripped from every non-today day
  (`weeklyBits={otherDay ? undefined : weeklyStore}`) — the exact regression
  the appearsOn() fix was meant to close. Gated on historical instead.
- Section drops always stamped due_date=today even when viewing another day —
  drop-zone ids now carry the viewed date ("section:<sec>:<date>").
- Upcoming Days rendered anytime tasks TWICE ([...SECTION_ORDER, "anytime"]).
- Active Tasks never showed anytime tasks (BUILD_PLAN requires them always).
- Flexible placement could oscillate forever with 2+ tasks sharing candidates
  (load map computed once per pass) — planPlacements() now updates the map as
  moves are accepted; +3 tests. "Delete for today" also clears
  window/candidates/placed_date so the placement effect can't resurrect it.
- Half-filled Window mode failed silently (constraint violation swallowed) —
  client-side validation + addTask now throws + the form shows the error.
- All-done jobs rendered "0 upcoming 0 active 0 overdue" — done/total was
  computed and tested but never displayed. Now shown.
- Skipped weekly cubes rendered identically to empty (one click on an invisible
  skip marked it complete) — now dashed/struck, click restores.
- CLAUDE.md loading-state rule: no skeleton existed anywhere; dashboard panels
  asserted "nothing to do" while loading (false-empty flash), AuthGate was a
  black screen, mobile BriefView blanked entirely during LLM brief generation.
  SkeletonRows everywhere, AuthGate pulses the wordmark, BriefView gates only
  on the task fetch.
- Optimistic updates completed per CLAUDE.md: uncompleteDay/unplanDay/
  updateWeeklyTask/updateJob/deleteJob/deleteTask now paint-then-persist with
  rollback; updateReminder gained rollback.
- useTasks.refresh bounded to open + last-30-days completed (was every task
  ever, refetched after every mutation).
- Jobs/Reminders tabs: hard xl:grid-cols-2 → auto-fit minmax per CLAUDE.md.
- Modal consistency: Escape on every dialog (shared useEscape), standard
  bg-void/85 backdrop-blur-sm z-50 backdrops, CategoryForm portalled + close X,
  hud-button-primary on every primary CTA. ChatBar's voice preview deliberately
  keeps NO Escape/click-outside (protects dictated content) — documented.
- Server brief now mirrors the client's flexible-overdue rule (daily-brief v7
  deployed); stale comments corrected (changedOn day model, carryover cron).
- Polish: one 44px/20px checkbox size in mixed lists, job status chips at
  legible size, DayNavigator not-today amber→signal, single-row Active Tasks
  arrows hidden, Upcoming Days rows cursor-pointer, double-click tooltip hint,
  copy fixes ("pencil menu"→current pattern, "No header"→"No company",
  future-day empty wording, countdown label from lg), RingGauge stroke
  tokenized.
- Dead deps removed: @dnd-kit/sortable, @dnd-kit/utilities, zod (frontend;
  edge functions use Deno's npm:zod@3 independently), @vite-pwa/assets-generator,
  public/pwa-64x64.png. .env.example restored (deleted on disk during the Neon
  experiments; HEAD's version was correct).

**Claims REJECTED after verification:**
- "Completing an overdue task deletes it" — completeTask is strictly an UPDATE;
  19 completed rows live in the DB, 14 of them completed while overdue.
- "job_id not attached at creation" — 7 tasks carry job_id; both create paths
  attach it. The real bug was the missing done/total display (fixed above).
- "Re-add the cursor glow (CLAUDE.md)" — the user explicitly ordered it removed;
  CLAUDE.md's line is stale. NOT re-added.
- "Hide arrows on single-row sections" — would have removed cross-section
  movement in Today's Schedule; applied to Active Tasks only.
- "Tokenize the #7FA89A fallbacks in JobsView" — they're concatenated with alpha
  suffixes (`${hex}1f`), which var() can't do; left as hex.
- "Double-click deviates from BUILD_PLAN's triple-click" — the user explicitly
  ordered double-click; BUILD_PLAN line 38 is stale.

**Known-and-deferred (documented, not fixed):**
- DST fall-back (Nov 1 2026): the 1:30 view boundary is crossed twice, so the
  page flips forward, back, and forward again across ~30 minutes. Self-corrects;
  a robust fix needs UTC-anchored day math.
- Reminder delivery race: the server cron stamps last_fired_at whether or not
  the app was open to show the alert; missed occurrences never alert. Needs the
  unbuilt reminder_fires model (BUILD_PLAN Phase 2 items: global toggle,
  countdown ring, repeat-until-dismissed, sounds — all still unbuilt).
- Dashboard remounts on tab switch (refetches brief/setup); enter/exit motion
  spec item; saveOrder N+1 (bulk upsert candidate); jobStatus.ts + ranking.ts
  kept deliberately (pre-built migration work / only executable spec of live
  server scoring); weekly_task_checkins.note+duration columns kept (BUILD_PLAN
  keeps duration_minutes as an editable field).
- Taste items for Keenan: corner-bracket motif, dashboard type scale 13→14px,
  Orbitron mixed-case greeting, Weekly-tab card grid at ultrawide, double-click
  vs hover-"⋯" menu, Finance strip height.

**Migration-ledger note:** two applied migrations have no on-disk file
(reminder_tick_cron, carry_forward_cron_5am) and 20260814000001 was applied as
two ledger entries — the disk set is not a faithful replay of the live DB.

## Portrait-monitor layout — third responsive target (built 2026-09-02)

CLAUDE.md added a rotated 24" monitor (~1080×1920) as a layout target distinct
from ultrawide and phone. Built and verified at exact viewports with a
throwaway harness (real Sidebar + DesktopDashboard/BriefView, fake stores;
deleted before commit).

**Detection.** `(orientation: portrait) and (min-width: 700px)` — portrait
alone would catch phones; the width floor keeps it to desktop-scale screens.
Declared ONCE in each runtime and deliberately identical: `@custom-variant tall`
in `src/styles/index.css` (styling) and `PORTRAIT_MONITOR_QUERY` in
`src/hooks/useMediaQuery.ts` (DOM order + orb size). If one changes, change
both. Below 1024px `isDesktop` is false and the phone BriefView renders
regardless, so the portrait branch only ever applies to ≥1024-wide portrait
screens (a 1080 rotated monitor; also a 1024×1366 tablet, which is the right
layout for it).

**Structure.** `DesktopDashboard` extracts every panel body into a shared
element and renders one of two arrangements. The ultrawide branch is the
BUILD_PLAN layout with its markup untouched; the portrait branch is a single
column (`px-6 gap-4`, sidebar kept at 250px → ~815px content column).

**Stacking order, and why** (a side monitor is a glance display: the top of a
tall screen is where a glance lands, the bottom needs a deliberate look down —
so most-frequent first, reference material last):
1. Orb at 240px (ultrawide: 380) + greeting + insight + capture box. The spec
   explicitly allows the shrink; it buys the actionable panels a place above the
   fold — Active Tasks starts at y≈510 on a 1920-tall screen.
2. Active Tasks — "what should I be doing right now": the shortest and most
   time-sensitive list, so it earns the eye-level slot at little height cost.
3. Today's Schedule — the panel the spec names as portrait's winner.
   `min-h-[42vh]` (≈806px at 1920, ≈1075 at 2560 — scales with the monitor),
   a MINIMUM not a cap: a packed day extends the panel (measured 1,124px with
   the harness's 8-item day, body `scrollHeight === clientHeight`, no inner
   scroll — on ultrawide the same day scrolls inside 640px). On a sparse day
   the slot list becomes a flex column (`tall:flex tall:flex-col tall:flex-1`)
   and each slot `tall:grow`s into the spare room (measured 157/117/117/157/117
   on a day holding only two weekly items) — bigger drop targets, not a hollow
   panel. `grow` (basis auto), never `flex-1` (basis 0), so a full slot is never
   clipped by its `overflow-hidden`.
4. Weekly Tasks — checked off a few times a day; compact 7-cube rows.
5. Upcoming Days — planning horizon and the schedule's day-picker; it's a wide
   element (three 240px day blocks) that needs the full column.
6. Active Jobs | Reminders — change rarely, glance-only; side by side in an
   auto-fit grid (two 376px cells at 1080).
7. Finance (placeholder until Phase 6), then the category backlogs in the
   existing auto-fit grid (two columns at 1080, three at 1440).

**Verified, 2026-09-02 (harness, exact viewports):**
- 1080×1920: `tall` true, `isDesktop` true; panel order exactly as above; orb
  240; header single-row (65px = the 44px pencil + padding, same as ultrawide);
  sticky header top=0 after scrolling; page ≈4,070px tall (~2 screens).
- 1440×2560 (27" rotated): same order, orb 240, schedule ≥1075 min, categories
  three columns.
- 2560×1440 ultrawide: `tall` false; flank grid 852|520|852, row 640, orb 380,
  original DOM order, schedule scrolls internally as before; the `tall:` slot
  classes are inert (`display:block`, `flex-grow:0`).
- 375×812 phone: `tall` false, BriefView + mobile header render, no horizontal
  overflow. Code path untouched by this change.

**Seen while verifying, NOT fixed (pre-existing, phone only):** in the mobile
BriefView the Weekly Tasks rows overflow — seven cubes are wider than a 375px
screen, so the recurrence/section chips overlap the Monday cube. Nothing in
this change touches that path; it's a separate phone-layout fix.

## Phase 2 — Reminders, full feature build (2026-09-06)

BUILD_PLAN's Reminders section was specified but only partly built: the five
recurrence types, the sidebar tab, the mini-panel and a beeping in-app alert
existed; everything below is new.

**Schema** (`20260906000001_reminders_full_build.sql`, applied live):
- `reminders` gains `sound_id text` (default 'double_ding'), `volume numeric`
  (0.7, CHECK 0–1), `max_repeats int` (10), `repeat_interval_seconds int` (20),
  with a CHECK keeping the repeat policy sane. `sound_id` is deliberately free
  TEXT, not an enum, so another file in `public/sounds/` needs only a line in
  `src/lib/sounds.ts` — no migration (an explicit BUILD_PLAN requirement).
- `reminder_fires` — one row per OCCURRENCE that came due. BUILD_PLAN's column
  list plus `occurrence_at`, which is load-bearing: it is the idempotency key
  (`unique (reminder_id, occurrence_at)`). BOTH the pg_cron tick and an open
  browser raise fires — the cron's 5-minute cadence is far too coarse for an
  "every 1 minute" reminder — so without it the same alert would fire twice.
- `app_settings (user_id pk, reminders_globally_enabled)` — the master switch.
  BUILD_PLAN says it "doesn't need its own table"; it does need a row somewhere,
  because the CRON has to honour it server-side, and it must be RLS-scoped. One
  row per user is that simple version.

**Architecture — this also closes the audit's "reminder delivery race".** The
old tick stamped `last_fired_at` whether or not anyone was watching, so an
occurrence that came due while the app was closed was silently swallowed and
never alerted. Now the tick RECORDS the occurrence as a fire row and the client
ALERTS from pending rows, so a missed occurrence still alerts when the app
reopens. The anchor advances to the OCCURRENCE, not to "now", so a late tick
cannot drag the cadence progressively later.

**Built:**
- `src/lib/sounds.ts` — the four sounds, with an unknown-id fallback, clamped
  volume, and a cached `<audio>` per sound so rapid re-alerts don't reallocate.
  Autoplay rejection is swallowed: the visual alert is the real signal.
- `CountdownRing.tsx` — the live ring. Per-frame updates are written straight to
  the DOM through refs inside rAF; React never re-renders for them.
  `stroke-dashoffset` is paint-only (no layout), the loop stops entirely while
  the tab is hidden, and reduced-motion degrades to a 1 Hz tick. Turns amber
  inside the last minute.
- `lib/reminders.ts` — `dueOccurrence`, `attemptDueAt`/`needsAttempt`/
  `isExhausted` (the repeat cadence), `secondsUntil`/`countdownLabel`, and
  `cycleSeconds`, which spans the REAL gap between consecutive occurrences
  (computed per recurrence shape, so a DST day is 23 or 25 hours and Mon/Wed/Fri
  reports its uneven gaps) rather than a nominal window.
- Repeat-until-dismissed: attempt N is due at `fired_at + N·interval`, so the
  first alert is immediate and the 10th still fires. Once spent it stops and the
  popup disappears — BUILD_PLAN is explicit that it must not linger as an
  unresolved notification.
- `ReminderForm` — sound picker with a per-sound preview button, volume slider
  (auditioned on release), and repeat-policy fields clamped to the DB's own
  CHECK bounds. Preview audio is stopped on unmount.
- `RemindersView` — the master toggle (labelled with its state, transform-only
  knob), cards carrying ring + recurrence + sound/volume/repeat, click-to-edit
  via the standard modal. Mini-panel rows now carry a small ring and the
  recurrence at a glance, and open the same modal on click.

**Bug found and fixed BY the verification** (not before it): `dueOccurrence`
originally returned the OLDEST outstanding occurrence. One alert either way, but
the anchor landed one slot behind, so a reminder that missed several slots
crawled forward one per tick — a 30-minute reminder idle for 90 minutes came
back at the first missed slot, not the current one. It now returns the MOST
RECENT due occurrence, with an arithmetic fast path for `interval` (a 1-minute
reminder after a week of downtime costs one calculation, not ten thousand) and a
400-step bound for date-based shapes. Client and Deno mirror both updated.

**Tested (2026-09-06).** 248 unit tests pass (48 in reminders.test.ts, 20 new).
Live firing, via the real pg_cron command so the secret stayed in the vault:
- One reminder of EACH of the five recurrence types, each seeded with a genuinely
  past-due occurrence → the tick raised exactly 5 fire rows, and every
  `occurrence_at` was the correct SCHEDULED slot rather than "now" (daily/weekly/
  monthly at their 20:34 time, interval at created+30m, one-time at its exact
  `fire_at`). `last_fired_at = occurrence_at` on all five; the one-time
  deactivated itself.
- A second tick re-fired NOTHING for the four recurring types (idempotent), and
  raised exactly one row for an interval rewound 3 hours — at its most recent
  slot, proving the catch-up fix.
- Master switch OFF → the tick returned `{"skipped":"reminders globally
  disabled"}`, banked no rows, and left the anchor untouched, so nothing is
  consumed while disabled and nothing floods back when it returns.
Browser (throwaway harness mounting the real components, since the sign-in gate
can't be passed in-session):
- The ring genuinely animates: `stroke-dashoffset` climbed 44.5 → 59.9
  monotonically over 5.2s at ~2.57/sec, against a mathematically exact
  circumference/cycle of 153.938/60 = 2.566.
- All five recurrence types render their pattern at a glance; 5 rings plus one
  "—" for the paused reminder; all four mp3s fetched and played (206, correct
  byte sizes); dismiss clears the alert; the master toggle flips every card and
  the mini-panel to their off state.

**Verification note:** the Browser pane runs HIDDEN and browsers fire no rAF
callbacks in a hidden tab, so the ring initially measured frozen for
environmental reasons. The harness swapped ONLY the frame scheduler for a
timer-driven equivalent; `CountdownRing` itself ran unmodified.

**Still Phase 8, not faked:** delivery when the app is closed. The fire rows are
the durable record the Telegram bot will read; browser push was deliberately not
used as a stand-in.

## Weekly-task pause, conditional anytime, global display rules (2026-09-07)

Reminders (BUILD_PLAN Phase 2) was already built, verified and pushed in the
previous session (commits affd5e9…eecaa65) — re-verified here, not rebuilt.

### Pause a weekly task (`20260907000001_weekly_task_paused.sql`, applied)
`weekly_tasks.paused boolean not null default false`, plus a partial index on
the not-paused rows since every schedule read filters by it. A flag on the row
rather than an archive table, so the recurrence pattern survives untouched and
unpausing resumes exactly as before.

`appearsOn()` returns false for a paused task FIRST, before any mode branch can
hand a day back — that one guard removes it from Today's Schedule on every day
(past, present and future) and from Active Tasks, since both read through it.
The "Unplanned Weekly Tasks" nudge moved to a new `needsPlanning()` — count-mode
only, never paused — so the nudge and the schedule now share one tested rule
instead of an inline expression. On the Weekly Tasks tab a paused task stays
visible, dimmed, with a "Paused" chip, a one-click Pause/Resume button on its
row, a matching checkbox in the edit modal, and a note replacing the progress
line ("Paused — not scheduled anywhere until resumed. Pattern kept.").

Distinct from "Skip today", which is one occurrence on one day and still lives
in `weekly_task_checkins` — covered by a test asserting the difference.

### Active Tasks: anytime is conditional
Supersedes the earlier "always show them" rule. `splitAnytime()` is the whole
decision, tested in isolation: an empty section promotes anytime work into the
main list (with a line saying why, so a glance doesn't misread it as belonging
to now); a section with its own work folds anytime into a collapsible "Anytime"
dropdown carrying a count. Arrows reorder the primary list only — parked work
shouldn't compete for ordering. The panel was restructured to keep the two
groups apart from the source data rather than merging and re-separating them.

### Two global display rules (CLAUDE.md), applied everywhere
- **12-hour with AM/PM, never 24-hour.** New `formatClock()`. Eight real
  violations fixed: the dashboard header clock (`hour12: false` → "22:34"),
  scheduled_time on task cards and in Upcoming Days, the voice-preview
  breakdown, wake time and blocked windows in both Today's Schedule and the
  setup summary, and the greeting insight ("Next: Dentist at 15:30"). An
  existing insight test asserted the 24-hour output — it encoded the violation
  and was updated to the rule. Deliberately NOT changed: `hourCycle: "h23"` in
  date math, and `<input type="time">` / `datetime-local` values, which require
  24-hour and are not display.
- **A completed task is never "overdue."** The styling already guarded on
  `done`, but the chip still rendered the words "5d overdue" for anything
  finished after its due date. Completed cards now show `formatCompleted()` —
  "Completed today" / "yesterday" / "N days ago" — on the same 1:30 AM view-day
  rule as the rest of the app.

### Found in live data and fixed
The one real reminder in the database ("Claude Check", every 45 minutes) had
banked 34 fire rows in a day: 31 already spent and silent, 2 still alertable.
The design held up — a day of accumulation produces 2 alerts, not 33 — but
`useReminders.refresh` fetched EVERY undismissed row unboundedly. Now bounded to
a 7-day window, which clears the worst-case repeat policy (100 attempts ×
3600s ≈ 4.2 days) with room to spare; `isExhausted` remains the authoritative
per-reminder filter. Those rows are the user's own data and were left alone.

**Known and not addressed:** fire rows have no retention policy — they are
permanent history and grow indefinitely. Harmless at single-user scale now that
the read is bounded, but a cleanup job is worth having eventually.

### Tested (2026-09-07) — 272 unit tests pass (26 new)
Server, via the real pg_cron command so the secret stayed in the vault: one
reminder of each of the five recurrence types, each with a past-due occurrence
→ the tick raised exactly 5 fire rows, each `occurrence_at` the correct
scheduled slot (daily/weekly/monthly at their time, interval at its most recent
slot, one-time at its exact moment), every anchor equal to its occurrence, and
the one-time deactivated itself.

Browser (throwaway harness mounting the real components, since the sign-in gate
can't be passed in-session):
- Countdown ring genuinely animates — stroke-dashoffset climbed monotonically at
  ~2.56/sec against an exact circumference/cycle of 153.938/60 = 2.566.
- Sound picker: all four files load (206, byte sizes matching disk) and audio
  genuinely plays — 0.47s into a 1.96s file at the configured 0.4 volume.
- Active Tasks, both branches: a populated midday section keeps anytime in a
  collapsed "Anytime 2" dropdown that expands to both items; an empty section
  shows them inline under "Nothing set for midday — showing anytime work", with
  no dropdown.
- A task due Sept 2 and completed Sept 4 renders "Completed 3 days ago" with no
  amber chip and the word "overdue" absent.
- Paused weekly task: listed, dimmed, "Paused" chip, Resume button
  (aria-pressed), and clicking Resume cleared it.
- A regex sweep of the whole rendered page found five 12-hour timestamps and
  ZERO 24-hour leaks.

**Verification note:** the Browser pane runs HIDDEN and browsers fire no rAF
callbacks in a hidden tab, so the ring measures frozen for environmental
reasons. The harness swapped ONLY the frame scheduler for a timer-driven
equivalent; CountdownRing itself ran unmodified.

## Exhaustive global-rules audit (2026-09-08)

Items 1–3 of this request (weekly-task pause, conditional anytime, the two global
display rules) were already built and pushed in the previous session
(93c0498…9aae46a) — re-verified, not rebuilt. The new instruction was to audit
EVERY render site rather than the obvious ones, so the rules genuinely hold app-wide.

**Method.** Seven independent read-only sweeps, each searching a deliberately
different way so no single angle's blind spot could hide a violation: by
formatting API (Intl/toLocale*/manual hour math), by data source (every column
holding a time, traced forward to render), by rendered JSX (including title/
aria-label/placeholder, where a 24-hour time is still user-visible), by literal
string pattern, plus dedicated sweeps for the overdue rule, the pause feature and
the anytime rule. Each dimension's findings then went to an adversarial verifier
told to REFUTE them and to default to "not real" when uncertain.

**Result: all seven sweeps independently converged on the same four sites** — good
evidence the set is complete rather than a lucky single pass. Three additional
candidates were raised by one sweep each and all three were killed on
verification. 14 agents, 573 tool calls.

**Confirmed and fixed (4):**
- `ScheduleSetup.tsx:162` — blocked-window chips rendered raw `{w.start}–{w.end}`.
  The schedule-setup edge function's own prompt asks Claude for "HH:MM 24h"
  ("dentist 2 to 3:30" → 14:00-15:30), so the chip read "⛔ 14:00–15:30 dentist".
  The identical data was ALREADY formatted correctly one file over in
  TodaySchedulePanel — the earlier pass fixed that copy and missed this one.
- `ScheduleSetup.tsx:158` — `bed {done.bedtime.slice(0, 5)}` → "bed 23:30",
  sitting directly beside the wake chip that the earlier pass had fixed.
- `TodaySchedulePanel.tsx:471` — "Morning cleared — bedtime was {…slice(0,5)}".
  Worth noting this one is ALWAYS wrong when visible: isLateBedtime only fires the
  banner for times after 11 PM or before 5 AM, so every render is a late-night
  value like "23:45" or "01:30" — never coincidentally 12-hour-safe.
- `DatePickerPopup.tsx:61` — the overdue rule leaking past the task card. The chip
  on a completed card was fixed earlier, but the EDIT MODAL that card opens still
  annotated its due date via formatDue, so a task due Aug 30 and finished Sep 5
  opened reading "2026-08-30 (9d overdue)". Reachable from the completed lists in
  CategoryPanelBody and TaskList, and from the double-click Reschedule popup. New
  tested `dueAnnotation()` picks formatCompleted for a completed task; an OPEN
  overdue task still reads "9d overdue", since the rule covers completed work only.

**Refuted (3), with reasons worth keeping:**
- `supabase/functions/_shared/actions.ts:94` — a tool-parameter description, not a
  render; speculative.
- `DesktopDashboard.tsx:419` — claimed paused weekly tasks inflate the header
  count. Refuted: the chip and the panel body below it show the same set.
- `ActiveTasksPanel.tsx:69` — claimed an anytime double-count. Refuted as
  unreachable: it needs `section === 'anytime'`, and the single call site derives
  section from currentSection(), which can never return anytime.

The paused and anytime sweeps found no real defects in their own dimensions, so
items 1 and 2 are complete as built.

**Tested.** 277 unit tests (5 new for dueAnnotation). In a running browser via a
throwaway harness: "bed 11:30 PM", "⛔ 2:00 PM–3:30 PM dentist", "Morning cleared —
bedtime was 1:30 AM", and the completed task's picker reading "2026-08-30
(Completed 3 days ago)" both standalone and inside the real edit modal — while the
open-task picker still correctly reads "9d overdue". A regex sweep of the whole
rendered page found zero 24-hour leaks.
