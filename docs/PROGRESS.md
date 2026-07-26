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

## Operational facts

- Secrets: `anthropic_api_key`, `cron_secret`, `project_url` in Supabase Vault via service-role-only RPCs; local copies in gitignored `.env`/`.env.local`.
- Edge functions: `assistant` (JWT ON), `journal-clean` (ON), `schedule-setup` (ON), `daily-brief` (OFF — cron secret or JWT checked in-function).
- Tests: `npm run test` — dates, ranking, sections, weekly cubes, dashboard layout model.
- Preview quirks (for future sessions): the Browser-pane preview loses auth sessions on restart and screenshots can time out — Keenan's own browser at localhost:5173 is the real verification surface; signed-in checks need him.

## Phases 3–9 — not started (hard gate; explicit approval required)
