# Customize Mode Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Supersedes the AddMenu three-option pencil menu.

**Goal:** The top-corner pencil becomes a single ON/OFF "customize mode" toggle. ON: every dashboard section is hold-drag repositionable and horizontally resizable via react-grid-layout (orb hero fixed above the grid), section titles become editable text fields, and Weekly Tasks + each category panel header shows a "+" that adds directly into that section. OFF: clean view, none of it visible. Arrangement + widths + custom labels persist per-user in a `dashboard_layouts` row. Item-click edit modals stay available regardless of the toggle (already built — verify only).

**Architecture:** `react-grid-layout` (12-col, rowHeight 10, resizeHandles e/w only — spec says horizontal resize), items auto-height via ResizeObserver per section (content height → h units; h never user-dragged). Default layout encodes the BUILD_PLAN two-column split (left x0 w6: weekly → categories → finance; right x6 w6: schedule → upcoming → jobs → journal; priorities x0 w12 bottom) — which also resolves the "still stacked" report, since the layout is now explicit pixel math rather than a Tailwind breakpoint, and the new npm dependency forces the user's stale dev server to restart. `draggableCancel` keeps buttons/inputs clickable while ON. Persistence: `dashboard_layouts` (user_id unique, layout jsonb {key: {x,y,w,label?}}), saved on drag-stop / resize-stop / label blur.

**Tasks:**
1. Migration `dashboard_layouts` + RLS, apply, hand-add to database.types. `npm i react-grid-layout` + types.
2. `src/lib/dashboardLayout.ts`: section keys (weekly, cat:<id>, finance, schedule, upcoming, jobs, journal, priorities), `defaultLayout(categoryIds)` (two-column spec), merge helper (saved ∪ defaults for new categories). Unit-test defaultLayout + merge.
3. `useDashboardLayout` hook: load/save row, label map, debounce-free save-on-stop.
4. Components: `CustomizeToggle` (pencil ON/OFF, replaces AddMenu — delete AddMenu.tsx), `DashSection` (grid-item chrome: hud-panel, editable title when customize, optional "+", measured content), `CategoryPanel` (extracted single-category section used by the dashboard grid; TaskList keeps its own copy for the Tasks tab).
5. Bare variants for TodaySchedulePanel / UpcomingDaysPanel / PrioritiesPanel (content without their own outer panel+title, so DashSection owns the chrome).
6. DesktopDashboard: hero unchanged; grid area = RGL with all sections; customize prop wires draggable/resizable/"+"/labels. RGL CSS imported + HUD-styled handles/placeholder.
7. Shell: customize state global; pencil top-right everywhere; TaskList (Tasks tab) + mobile BriefView weekly section show their "+" adds when ON. TaskForm gains `defaults` (preset category/due). Verify item-click modals ungated.
8. Build, tests, boot check, commit, plain-language report incl. dev-server-restart instruction.
