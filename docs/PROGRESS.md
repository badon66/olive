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

- **The day rolls over at 01:30 America/Edmonton, not midnight (and not 7 AM — that earlier prompt was wrong and is fully replaced).** `DAY_START_MINUTES = 90` in `src/lib/dates.ts`; `edmontonMinutes()` gives minutes since local midnight and `edmontonToday()` subtracts a day when it's < 90, so anything captured/completed between midnight and 1:30 AM still belongs to the previous day. Mirrored minute-for-minute in the edge functions (`_shared/brief.ts` `edmontonToday`, `assistant` `edmontonToday`, `schedule-setup` `edmontonTomorrow`) so client and server agree — deployed assistant v5 / daily-brief v4 / schedule-setup v3. Separate from `wake_time`. Tested in `dates.test.ts` (1:00/1:29 = previous day, 1:30 flips, midnight = previous day, month boundary). The assistant system prompt now tells Claude "the day rolls over at 1:30am."
- **Today's Schedule is a fixed 6-part Night-bookended ribbon.** `SCHEDULE_SLOTS` in `src/lib/sections.ts` renders, in order: **Night · earlier** → Morning → Midday → Afternoon → Evening → **Night · tonight**, plus an **Anytime** row appended only when it holds something. `partitionSchedule(dueToday, today)` (unit-tested) routes night-section tasks by due date — anything due before today falls into the leading "earlier" slot (read-only context: dashed border, dimmed, *not* a drop target; no weekly/pull-forward there), today's night tasks into "tonight". Every other task drops into its own `time_section`; a null section is Anytime. Overdue daytime tasks still surface in their own section (e.g. a 3-day-overdue morning task stays under Morning), never in the leading Night. The whole ribbon advances to the next day automatically because it's fed `today` (which flips at 1:30 AM) — no per-slot clock. Verified in a running browser via a throwaway harness (now deleted); accessibility tree confirmed the exact order and routing.
- Greeting subtext is a real insight (`src/lib/insight.ts`): next booked appointment → else top-priority item in the current part of day → else due/overdue state, plus a done/total stat.

## Drag/resize/rename audit (2026-07-26)

- Confirmed **no** section drag/resize/rename code exists anywhere. `react-grid-layout` is uninstalled, the `dashboard_layouts` table is dropped, and only historical migration references remain (correct). BUILD_PLAN.md's leftover "Customize layout mode" bullet was stale spec, not an implemented feature. Item-level task drag (dnd-kit, tasks between panels) is intentionally kept and is unrelated.

## Phase 3 — Active jobs log (built 2026-07-26, awaiting Keenan's signed-in test)

- **Schema** (`migrations/20260726000001_phase3_active_jobs.sql`, applied live): `active_jobs` (name, `job_status` enum quoted/sold/in_progress/paid, nullable `category_id` header, `sheet_row_ref` reserved for Phase 5, `notes`, `created_at`, `updated_at` with a touch trigger) + a nullable `tasks.job_id` FK (`on delete set null` — deleting a job un-scopes its tasks, never destroys them). Types regenerated into `database.types.ts`.
- **Pure logic** `src/lib/jobs.ts` (7 unit tests): `JOB_STATUSES` order, labels, `isActiveStatus` (all but paid), `activeCount`, `sortJobs` (stage asc then most-recent), `groupByStatus`, `changedOn` (buckets `updated_at` by the 1:30 Edmonton day).
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
- **Rollover countdown** (`RolloverCountdown.tsx` + `secondsUntilRollover`/`formatCountdown`, tested): live H:MM:SS to the next 1:30 AM rollover, in the sticky header.
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
- **Not built this pass (flagged):** the "bedtime after 11 PM auto-drops tomorrow's Morning tasks" rule (BUILD_PLAN line 48); the automatic due-date bump at rollover for carryover (carryover is surfaced for manual action, not physically rolled).

## Time-section clock-range display (2026-07-27)

- BUILD_PLAN's section boundaries were **resolved** (6–7 PM folds into Evening 6–11 PM; 11 PM–midnight into Night 11 PM–5 AM), unblocking the display. `sectionClockLabel(section, wakeTime)` in `sections.ts` (tested): Morning is wake-relative (`wake → 12:00 PM`, default 11:00), Midday 12–4 PM, Afternoon 4–6 PM, Evening 6–11 PM, Night 11 PM–5 AM, Anytime none. Rendered as a light suffix on every Today's Schedule section header (ribbon + past/future read-back), using the day's `wake_time`.
- **Note:** this is the informational header display only. The live "which section is it now" logic (`currentSection`/`pullForward` in `suggest.ts`) still uses its older fixed ranges (morning 7–11, etc.) — aligning that to the resolved boundaries is a separate, behavior-affecting change, not done here.

## Operational facts

- Secrets: `anthropic_api_key`, `cron_secret`, `project_url` in Supabase Vault via service-role-only RPCs; local copies in gitignored `.env`/`.env.local`.
- Edge functions: `assistant` (JWT ON, v8), `journal-clean` (ON), `schedule-setup` (ON, v4), `daily-brief` (OFF, v5 — cron secret or JWT checked in-function).
- Tests: `npm run test` — dates, ranking, sections, weekly cubes, dashboard layout model.
- Preview quirks (for future sessions): the Browser-pane preview loses auth sessions on restart and screenshots can time out — Keenan's own browser at localhost:5173 is the real verification surface; signed-in checks need him.

## Phases 4–9 — not started (hard gate; explicit approval required)
