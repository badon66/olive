# Phase 1 Follow-up — Priorities Dropdown, scheduled_time, Cross-Panel Drag-and-Drop

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Scope = three items from BUILD_PLAN's "Follow-up fix round", explicitly requested 2026-07-08. The other follow-up items (categories table, calendar popup, wake times, daily tasks) are NOT in this round.

**Goal:** (1) Priorities becomes a collapsible dropdown, collapsed by default with an "N overdue" summary, overdue folded in at the top — no separate Overdue section anywhere. (2) Tasks gain `scheduled_time` (fixed-time bookings) shown as a mono time chip and used for ordering. (3) Tasks drag between Priorities, Habits, Today's schedule (time sections), and next-7-days day blocks; every drop writes to the DB immediately.

**Architecture:** Two prerequisite panels get built because they're drop targets: Today's schedule (tasks due today grouped by `time_section`; null = Anytime) and Next 7 Days as day blocks (tomorrow…+7, rendered Monday-first — any 7 consecutive days contain each weekday exactly once). New `src/components/board/` folder holds the three panels + one `TaskBoard` wrapper that owns the single `DndContext`; mobile BriefView and DesktopDashboard both render `TaskBoard`, so DnD works identically on both (touch sensor on mobile).

**Library & feel (locked):** `@dnd-kit/core` + `@dnd-kit/sortable` — headless (styles stay ours), maintained, touch+keyboard sensors. PointerSensor activation distance 6px (no accidental drags), TouchSensor 200ms hold / 8px tolerance. `DragOverlay` = floating task-title chip with signal glow; droppable targets brighten their border + inner glow while hovered; arrows in Priorities stay (keyboard/a11y fallback per gesture-alternative rule).

**Drop semantics (locked):**
- within Priorities (sortable) → `saveManualOrder(arrayMove(order))`
- onto a schedule section → `updateTask(id, { due_date: today, time_section })` (`anytime` stores null)
- onto a day block → `updateTask(id, { due_date: block.date })` (time_section preserved)
- onto Habits panel → convert: `addHabit(task.title, "daily")` then `deleteTask(id)` (spec lists Habits as a DnD panel; conversion is the only meaningful task→habit write; confirmation toast shown)

## Tasks

1. **Migration `20260707000006_scheduled_time_sections.sql`** — `create type time_section as enum ('morning','midday','afternoon','evening','anytime');` + `alter table tasks add column scheduled_time time, add column time_section time_section;` Apply via MCP, regenerate types, advisors, commit.
2. **Pure helpers (TDD)** in `src/lib/sections.ts` + tests: `dayBlockDates(today): string[]` (7 dates tomorrow…+7 ordered Mon-first), `scheduleSort(a, b)` (scheduled_time asc nulls-last, then priority desc, then created_at), `SECTION_ORDER = ["morning","midday","afternoon","evening","anytime"]`.
3. **Install dnd-kit**; `src/components/board/TaskBoard.tsx` (DndContext, sensors, overlay, drop handlers via props: taskStore + habitStore + brief order fns), `PrioritiesPanel.tsx` (collapsible; summary `⚠ N overdue · M today` with amber when overdue>0; expanded = overdue-first ranked list, draggable + arrows), `TodaySchedulePanel.tsx` (5 droppable sections, TaskCard rows sorted by scheduleSort), `DayBlocksPanel.tsx` (7 droppable blocks: weekday + date + count + up to 3 titles, each title draggable).
4. **TaskForm**: `scheduled_time` (native time input — the calendar-popup item covers due *date*, not requested now) + `time_section` select (blank = anytime/null). **TaskCard**: mono chip `⏱ 14:30` when scheduled_time set.
5. **Wire both shells**: BriefView (mobile) replaces Overdue/Today/Next-7 panels with TaskBoard (keeps ring + streaks); DesktopDashboard replaces Priorities/Overdue/Today/Next-7 panels with TaskBoard panels split left/right (Priorities+Habits left, Schedule+DayBlocks+Journal right) inside one DndContext; Habits panel registered as droppable. Remove now-unused Overdue rendering.
6. **Verify** (build, 29+new tests, live drag in preview once signed in), update CLAUDE.md if commands change (they don't), commit per task, handoff. STOP — no other follow-up items, no Phase 3.
