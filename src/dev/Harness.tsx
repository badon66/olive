import { useMemo, useRef, useState } from "react";
import { BriefView } from "../components/BriefView";
import { DesktopDashboard } from "../components/DesktopDashboard";
import { Sidebar } from "../components/Sidebar";
import { TaskForm } from "../components/TaskForm";
import type { CategoryRow, CategoryStore } from "../hooks/useCategories";
import {
  ChecklistContext,
  type ChecklistItem,
  type ChecklistParent,
  type ChecklistStore,
  type WeeklyCheck,
} from "../hooks/useChecklists";
import type { Job, JobStore } from "../hooks/useJobs";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { ReminderStore } from "../hooks/useReminders";
import type { Task, TaskInput, TaskStore } from "../hooks/useTasks";
import type { WeeklyCheckin, WeeklyDayOverride, WeeklyStore, WeeklyTask, WeeklyTaskInput } from "../hooks/useWeeklyTasks";
import {
  checklistProgress,
  nextSortOrder,
  reorderChecklist,
  sortItems,
  weeklyChecklistProgress,
  weeklyItemDoneOn,
} from "../lib/checklist";
import { addDays, edmontonActiveDay, edmontonToday } from "../lib/dates";
import { completeDayPatch, reopenPatch, uncompleteDayPatch } from "../lib/flexible";
import type { TimeSection } from "../lib/sections";
import { currentSection } from "../lib/suggest";
import { normalizeOverridePatch, overrideIsEmpty, type OverridePatch } from "../lib/weekly";

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY FIXTURE DASHBOARD. Not part of the app.
//
// `npm run dev`, then open  http://localhost:5173/?harness=busy  (or =light).
// It mounts the REAL dashboard components over in-memory stores shaped exactly
// like the real hooks, so the layout, the panels' rules and the popups can be
// exercised and measured without a signed-in Supabase session. Every write the
// components make is logged on window.__olive.writes.
//
// Reached only through main.tsx behind `import.meta.env.DEV`, which Vite folds
// to `false` in a production build, so none of this ships.
//
//   busy  — the current part of the day holds 3 tasks of its own (+ the
//           checklist task): medium anytime work must fold into the dropdown.
//   light — it holds 1 task (+ the checklist task): medium anytime work surfaces.
// ─────────────────────────────────────────────────────────────────────────────

type HarnessWrite = { table: string; op: string; data: unknown; at: string };
declare global {
  interface Window {
    __olive?: { writes: HarnessWrite[]; fixtures: { today: string; activeDay: string; section: TimeSection } };
  }
}
const writes: HarnessWrite[] = [];
const write = (table: string, op: string, data: unknown) => {
  writes.push({ table, op, data, at: new Date().toISOString() });
};

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;
const USER = "harness-user";
const NOW = new Date().toISOString();

// ── Fixtures ────────────────────────────────────────────────────────────────

const CATS: CategoryRow[] = [
  { id: "cat-personal", name: "Personal", color: "#4a9eff", created_at: NOW, user_id: USER },
  { id: "cat-powerplay", name: "PowerPlay Customs", color: "#f5c518", created_at: NOW, user_id: USER },
  { id: "cat-alberta", name: "Alberta Premium Coatings", color: "#52c41a", created_at: NOW, user_id: USER },
];

function mkTask(p: Partial<Task> & { id: string; title: string }): Task {
  return {
    auto_carry_forward: true,
    candidate_dates: null,
    category_id: "cat-personal",
    completed_at: null,
    completed_dates: null,
    created_at: NOW,
    description: null,
    due_date: null,
    duration_minutes: null,
    job_id: null,
    priority_weight: 2,
    scheduled_time: null,
    sort_order: null,
    status: "open",
    time_section: null,
    user_id: USER,
    window_end: null,
    window_start: null,
    ...p,
  };
}

function mkWeekly(p: Partial<WeeklyTask> & { id: string; name: string }): WeeklyTask {
  return {
    created_at: NOW,
    paused: false,
    priority_weight: 2,
    recurrence_mode: "fixed_days",
    scheduled_days: [0, 1, 2, 3, 4, 5, 6],
    sort_order: null,
    target_per_week: null,
    time_section: null,
    user_id: USER,
    ...p,
  };
}

function mkJob(p: Partial<Job> & { id: string; name: string }): Job {
  return { category_id: null, created_at: NOW, notes: null, sheet_row_ref: null, status: "quoted", updated_at: NOW, user_id: USER, ...p };
}

function buildFixtures(mode: string) {
  const today = edmontonToday();
  const active = edmontonActiveDay();
  const section = currentSection(new Date());
  const win = (from: number, to: number) => ({
    window_start: addDays(today, from),
    window_end: addDays(today, to),
    due_date: addDays(today, to),
  });

  const tasks: Task[] = [
    // Keenan's real open tasks on 2026-10-08, dated relative to today so the
    // harness reads the same way on any day. Priorities are the remapped 1-3.
    mkTask({ id: "t-insurance", title: "Register Vesper Lighting Inc. insurance", ...win(13, 20), time_section: "anytime", priority_weight: 3, category_id: "cat-alberta" }),
    mkTask({ id: "t-diploma", title: "Go to school to sign up for social diploma", ...win(4, 8), time_section: "midday", priority_weight: 3 }),
    mkTask({ id: "t-ssn", title: "Get SSN for Vespers GST Number", ...win(0, 7), time_section: "anytime", priority_weight: 3, category_id: "cat-alberta" }),
    // The checklist task: a window covering today, in the CURRENT part of day,
    // so it sits in Active Tasks with its "1/5" count.
    mkTask({ id: "t-clothing", title: "Figure out charlies order + others", ...win(0, 2), time_section: section, priority_weight: 3, category_id: "cat-powerplay", description: "Sizes and colours for everyone before the shop closes Friday." }),
    mkTask({ id: "t-nwhc", title: "Work on the Northwest Hockey Club order sheet", due_date: addDays(today, 1), time_section: "midday", priority_weight: 3, category_id: "cat-powerplay" }),
    mkTask({ id: "t-truck", title: "Get a Work Truck", ...win(0, 5), time_section: "anytime", priority_weight: 3, category_id: "cat-alberta" }),
    mkTask({ id: "t-cold", title: "Automated Youth Cold Email", candidate_dates: [addDays(today, -1), today, addDays(today, 3), addDays(today, 6)], due_date: addDays(today, 6), time_section: "night", priority_weight: 3, category_id: "cat-powerplay" }),
    // Medium-priority anytime, a pick task ending in 4 days — the "medium" case.
    mkTask({ id: "t-lizzie", title: "Get back to Lizzie with her email about the color", candidate_dates: [0, 1, 2, 3, 4].map((d) => addDays(today, d)), due_date: addDays(today, 4), time_section: "anytime", priority_weight: 2, category_id: "cat-powerplay" }),
    // The anytime rule, one task per priority level, due on the active day.
    mkTask({ id: "t-any-urgent", title: "TEST urgent anytime", due_date: active, time_section: "anytime", priority_weight: 3, description: "Priority 3 — must always sit in the main list." }),
    mkTask({ id: "t-any-medium", title: "TEST medium anytime", due_date: active, time_section: "anytime", priority_weight: 2, description: "Priority 2 — surfaces only while the section is light." }),
    mkTask({ id: "t-any-low", title: "TEST low anytime", due_date: active, time_section: "anytime", priority_weight: 1, description: "Priority 1 — follows the base rule." }),
    // The current section's own work: 3 tasks when busy, 1 when light.
    mkTask({ id: "t-sec-a", title: "TEST section task A", due_date: active, time_section: section, priority_weight: 2, description: "Belongs to the current part of the day." }),
    ...(mode === "busy"
      ? [
          mkTask({ id: "t-sec-b", title: "TEST section task B", due_date: active, time_section: section, priority_weight: 1 }),
          mkTask({ id: "t-sec-c", title: "TEST section task C", due_date: active, time_section: section, priority_weight: 2 }),
        ]
      : []),
    // A finished task, completed after its due date — must read "Completed", never "overdue".
    mkTask({ id: "t-done-late", title: "Order more primer", due_date: addDays(today, -3), status: "completed", completed_at: NOW, category_id: "cat-alberta" }),
    // Scheduled times — every clock in the app must render 12-hour.
    mkTask({ id: "t-dentist", title: "Dentist", due_date: addDays(today, 1), scheduled_time: "15:30:00", time_section: "midday", priority_weight: 2 }),
    mkTask({ id: "t-call", title: "Call back the Flames parent", due_date: today, scheduled_time: "18:45:00", time_section: "evening", priority_weight: 2, category_id: "cat-powerplay" }),
  ];

  // Weekly occurrences in the current part of day count as its own uncompleted
  // work (they are visibly on the list), so in LIGHT mode none of them may sit
  // in the current section — otherwise the section is not light at all.
  const away: TimeSection = section === "evening" ? "midday" : "evening";
  const place = (s: TimeSection): TimeSection => (mode === "light" && s === section ? away : s);
  const weekly: WeeklyTask[] = [
    mkWeekly({ id: "w-walk", name: "Walk dog", time_section: place("morning"), priority_weight: 2 }),
    mkWeekly({ id: "w-stretch", name: "Stretch", time_section: place("morning"), priority_weight: 1 }),
    mkWeekly({ id: "w-gym", name: "Gym session", recurrence_mode: "count", scheduled_days: null, target_per_week: 3, time_section: place("evening"), priority_weight: 3 }),
    mkWeekly({ id: "w-room", name: "Clean my room", scheduled_days: [1, 2, 3, 6], time_section: place("evening") }),
    mkWeekly({ id: "w-review", name: "Sunday Review Time", scheduled_days: [6], time_section: place("night") }),
    mkWeekly({ id: "w-meal", name: "Eat the second meal of the day", time_section: place("evening") }),
  ];

  const jobs: Job[] = [
    mkJob({ id: "j-dennis", name: "Dennis's driveway", status: "sold", category_id: "cat-alberta", notes: "Two-coat epoxy, flake finish." }),
    mkJob({ id: "j-flames", name: "Flames jerseys — 24 units", status: "in_progress", category_id: "cat-powerplay" }),
    mkJob({ id: "j-smith", name: "Smith garage floor", status: "quoted", category_id: "cat-alberta" }),
    mkJob({ id: "j-alumni", name: "Oilers alumni order", status: "sold", category_id: "cat-powerplay" }),
    mkJob({ id: "j-done", name: "Paid last month", status: "paid", category_id: "cat-alberta" }),
  ];

  const items: ChecklistItem[] = [
    { id: "ci-1", task_id: "t-clothing", weekly_task_id: null, title: "Charlie's portion", sort_order: 0, completed: true, completed_at: NOW, created_at: NOW, user_id: USER },
    { id: "ci-2", task_id: "t-clothing", weekly_task_id: null, title: "Keenan's portion", sort_order: 1, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-3", task_id: "t-clothing", weekly_task_id: null, title: "Vesper's portion", sort_order: 2, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-4", task_id: "t-clothing", weekly_task_id: null, title: "General sizes", sort_order: 3, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-5", task_id: "t-clothing", weekly_task_id: null, title: "Confirm colours", sort_order: 4, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-w1", task_id: null, weekly_task_id: "w-walk", title: "Leash", sort_order: 0, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-w2", task_id: null, weekly_task_id: "w-walk", title: "Bags", sort_order: 1, completed: false, completed_at: null, created_at: NOW, user_id: USER },
    { id: "ci-w3", task_id: null, weekly_task_id: "w-walk", title: "Water", sort_order: 2, completed: false, completed_at: null, created_at: NOW, user_id: USER },
  ];
  // Yesterday's walk was fully ticked — today must start with empty boxes.
  const checks: WeeklyCheck[] = ["ci-w1", "ci-w2", "ci-w3"].map((id) => ({
    id: `wc-${id}`,
    checklist_item_id: id,
    date: addDays(today, -1),
    completed: true,
    created_at: NOW,
    user_id: USER,
  }));

  return { today, active, section, tasks, weekly, jobs, items, checks };
}

// ── In-memory stores, shaped like the real hooks ────────────────────────────

function useFakeTasks(initial: Task[]): TaskStore {
  const [tasks, setTasks] = useState(initial);
  const ref = useRef(tasks);
  ref.current = tasks;
  const patch = async (id: string, p: Record<string, unknown>) => {
    write("tasks", "update", { id, ...p });
    setTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...p } as Task) : t)));
  };
  return {
    tasks,
    loading: false,
    refresh: async () => {},
    addTask: async (input: TaskInput) => {
      const id = uid("task");
      write("tasks", "insert", { id, ...input });
      setTasks((prev) => [...prev, mkTask({ id, ...(input as Partial<Task>), title: input.title })]);
      return id;
    },
    updateTask: (id, p) => patch(id, p),
    completeTask: (id) => patch(id, { status: "completed", completed_at: new Date().toISOString() }),
    completeTaskDay: async (id, date) => {
      const t = ref.current.find((x) => x.id === id);
      if (t) await patch(id, completeDayPatch(t, date, edmontonToday(), new Date().toISOString()));
    },
    uncompleteTaskDay: async (id, date) => {
      const t = ref.current.find((x) => x.id === id);
      if (t) await patch(id, uncompleteDayPatch(t, date));
    },
    reopenTask: async (id) => {
      const t = ref.current.find((x) => x.id === id);
      await patch(id, t ? reopenPatch(t) : { status: "open", completed_at: null });
    },
    saveOrder: async (updates) => {
      write("tasks", "sort_order", updates);
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t)));
    },
    deleteTask: async (id) => {
      write("tasks", "delete", { id });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    },
  };
}

function useFakeWeekly(initialTasks: WeeklyTask[]): WeeklyStore {
  const [weeklyTasks, setWeeklyTasks] = useState(initialTasks);
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([]);
  const [dayOverrides, setDayOverrides] = useState<WeeklyDayOverride[]>([]);
  const ovRef = useRef(dayOverrides);
  ovRef.current = dayOverrides;

  const upsert = async (weekly_task_id: string, date: string, status: WeeklyCheckin["status"]) => {
    write("weekly_task_checkins", "upsert", { weekly_task_id, date, status });
    const row: WeeklyCheckin = { id: `chk-${weekly_task_id}-${date}`, weekly_task_id, date, status, note: null, duration_minutes: null, created_at: NOW, user_id: USER };
    setCheckins((prev) => [...prev.filter((c) => !(c.weekly_task_id === weekly_task_id && c.date === date)), row]);
    return row;
  };
  const removeRow = async (id: string, date: string) => {
    write("weekly_task_checkins", "delete", { weekly_task_id: id, date });
    setCheckins((prev) => prev.filter((c) => !(c.weekly_task_id === id && c.date === date)));
  };
  const updateWeeklyTask = async (id: string, p: Partial<WeeklyTaskInput>) => {
    write("weekly_tasks", "update", { id, ...p });
    setWeeklyTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...p } as WeeklyTask) : t)));
  };
  const clearDayOverride = async (id: string, date: string) => {
    write("weekly_task_day_overrides", "delete", { weekly_task_id: id, date });
    setDayOverrides((prev) => prev.filter((o) => !(o.weekly_task_id === id && o.date === date)));
  };
  const setDayOverride = async (id: string, date: string, p: OverridePatch) => {
    const next = normalizeOverridePatch(p);
    if (overrideIsEmpty(next)) return clearDayOverride(id, date);
    write("weekly_task_day_overrides", "upsert", { weekly_task_id: id, date, ...next });
    setDayOverrides((prev) => [
      ...prev.filter((o) => !(o.weekly_task_id === id && o.date === date)),
      { id: `ov-${id}-${date}`, weekly_task_id: id, date, created_at: NOW, user_id: USER, ...next },
    ]);
  };

  return {
    weeklyTasks,
    checkins,
    dayOverrides,
    overridesReady: true,
    loading: false,
    refresh: async () => {},
    setDayOverride,
    clearDayOverride,
    addWeeklyTask: async (input) => {
      const id = uid("weekly");
      write("weekly_tasks", "insert", { id, ...input });
      setWeeklyTasks((prev) => [...prev, mkWeekly({ id, ...(input as Partial<WeeklyTask>), name: input.name })]);
      return id;
    },
    updateWeeklyTask,
    moveWeeklySection: async (id, section, date) => {
      const pin = ovRef.current.find((o) => o.weekly_task_id === id && o.date === date && o.time_section !== null);
      if (section === null) {
        await updateWeeklyTask(id, { time_section: null });
        if (pin) await setDayOverride(id, date, { name: pin.name, scheduled_time: pin.scheduled_time, time_section: null });
        return;
      }
      if (pin) {
        await setDayOverride(id, date, { name: pin.name, scheduled_time: pin.scheduled_time, time_section: section });
        return;
      }
      await updateWeeklyTask(id, { time_section: section });
    },
    pinWeeklySection: async (id, date, section) => {
      const o = ovRef.current.find((x) => x.weekly_task_id === id && x.date === date);
      await setDayOverride(id, date, { name: o?.name ?? null, scheduled_time: o?.scheduled_time ?? null, time_section: section });
    },
    saveWeeklyOrder: async (updates) => {
      write("weekly_tasks", "sort_order", updates);
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setWeeklyTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t)));
    },
    deleteWeeklyTask: async (id) => {
      write("weekly_tasks", "delete", { id });
      setWeeklyTasks((prev) => prev.filter((t) => t.id !== id));
    },
    skipDay: (id, date) => upsert(id, date, "skipped"),
    planDay: (id, date) => upsert(id, date, "planned"),
    completeDay: (id, date) => upsert(id, date, "completed"),
    unplanDay: removeRow,
    uncompleteDay: async (task, date) => {
      if (task.recurrence_mode === "count") await upsert(task.id, date, "planned");
      else await removeRow(task.id, date);
    },
  };
}

function useFakeChecklists(initialItems: ChecklistItem[], initialChecks: WeeklyCheck[]): ChecklistStore {
  const [items, setItems] = useState(initialItems);
  const [checks, setChecks] = useState(initialChecks);
  const ref = useRef(items);
  ref.current = items;
  const matches = (i: ChecklistItem, parent: ChecklistParent) =>
    "task_id" in parent ? i.task_id === parent.task_id : i.weekly_task_id === parent.weekly_task_id;
  const itemsForTask = (taskId: string) => sortItems(items.filter((i) => i.task_id === taskId));
  const itemsForWeekly = (weeklyId: string) => sortItems(items.filter((i) => i.weekly_task_id === weeklyId));
  const addItems = async (parent: ChecklistParent, titles: string[]) => {
    const clean = titles.map((t) => t.trim()).filter(Boolean);
    if (clean.length === 0) return;
    let next = nextSortOrder(ref.current.filter((i) => matches(i, parent)));
    const rows: ChecklistItem[] = clean.map((title) => ({
      id: uid("ci"),
      user_id: USER,
      task_id: "task_id" in parent ? parent.task_id : null,
      weekly_task_id: "weekly_task_id" in parent ? parent.weekly_task_id : null,
      title,
      sort_order: next++,
      completed: false,
      completed_at: null,
      created_at: NOW,
    }));
    write("task_checklist_items", "insert", rows);
    setItems((prev) => [...prev, ...rows]);
  };
  return {
    items,
    checks,
    loading: false,
    refresh: async () => {},
    itemsForTask,
    itemsForWeekly,
    taskProgress: (taskId) => {
      const mine = itemsForTask(taskId);
      return mine.length === 0 ? null : checklistProgress(mine);
    },
    weeklyProgress: (weeklyId, date) => {
      const mine = itemsForWeekly(weeklyId);
      return mine.length === 0 ? null : weeklyChecklistProgress(mine, checks, date);
    },
    isWeeklyItemDone: (itemId, date) => weeklyItemDoneOn(itemId, checks, date),
    addItems,
    addItem: (parent, title) => addItems(parent, [title]),
    renameItem: async (id, title) => {
      write("task_checklist_items", "update", { id, title });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
    },
    removeItem: async (id) => {
      write("task_checklist_items", "delete", { id });
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    moveItem: async (parent, index, dir) => {
      const updates = reorderChecklist(ref.current.filter((i) => matches(i, parent)), index, dir);
      if (updates.length === 0) return;
      write("task_checklist_items", "sort_order", updates);
      const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
      setItems((prev) => prev.map((i) => (byId.has(i.id) ? { ...i, sort_order: byId.get(i.id)! } : i)));
    },
    setItemDone: async (id, done) => {
      const completed_at = done ? new Date().toISOString() : null;
      write("task_checklist_items", "update", { id, completed: done, completed_at });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: done, completed_at } : i)));
    },
    setWeeklyCheck: async (itemId, date, done) => {
      write("weekly_checklist_checks", "upsert", { checklist_item_id: itemId, date, completed: done });
      setChecks((prev) => [
        ...prev.filter((c) => !(c.checklist_item_id === itemId && c.date === date)),
        { id: `wc-${itemId}-${date}`, checklist_item_id: itemId, date, completed: done, created_at: NOW, user_id: USER },
      ]);
    },
    moveItems: async (from, to) => {
      write("task_checklist_items", "move", { from, to });
      const p = {
        task_id: "task_id" in to ? to.task_id : null,
        weekly_task_id: "weekly_task_id" in to ? to.weekly_task_id : null,
        completed: false,
        completed_at: null,
      };
      setItems((prev) => prev.map((i) => (matches(i, from) ? { ...i, ...p } : i)));
    },
  };
}

function useFakeCategories(): CategoryStore {
  const [categories] = useState(CATS);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  return { categories, byId, loading: false, refresh: async () => {}, addCategory: async () => {}, updateCategory: async () => {} };
}

function useFakeJobs(initial: Job[]): JobStore {
  const [jobs, setJobs] = useState(initial);
  return {
    jobs,
    loading: false,
    refresh: async () => {},
    addJob: async () => {},
    updateJob: async (id, p) => {
      write("active_jobs", "update", { id, ...p });
      setJobs((prev) => prev.map((j) => (j.id === id ? ({ ...j, ...p } as Job) : j)));
    },
    deleteJob: async (id) => setJobs((prev) => prev.filter((j) => j.id !== id)),
  };
}

const fakeReminders = {
  reminders: [],
  fires: [],
  globallyEnabled: true,
  loading: false,
  refresh: async () => {},
} as unknown as ReminderStore;

// ── The page ────────────────────────────────────────────────────────────────

export function Harness({ mode }: { mode: string }) {
  const fixtures = useMemo(() => buildFixtures(mode), [mode]);
  const taskStore = useFakeTasks(fixtures.tasks);
  const weeklyStore = useFakeWeekly(fixtures.weekly);
  const checklistStore = useFakeChecklists(fixtures.items, fixtures.checks);
  const categoryStore = useFakeCategories();
  const jobStore = useFakeJobs(fixtures.jobs);
  const [customize, setCustomize] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  window.__olive = { writes, fixtures: { today: fixtures.today, activeDay: fixtures.active, section: fixtures.section } };

  return (
    <ChecklistContext.Provider value={checklistStore}>
      <div className="lg:flex min-h-dvh">
        <Sidebar active="dashboard" onNavigate={() => {}} open={false} onClose={() => {}} />
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 relative">
            {isDesktop ? (
              <DesktopDashboard
                taskStore={taskStore}
                weeklyStore={weeklyStore}
                categoryStore={categoryStore}
                jobStore={jobStore}
                reminderStore={fakeReminders}
                onOpenJobs={() => {}}
                onOpenReminders={() => {}}
                customize={customize}
                onToggleCustomize={() => setCustomize((c) => !c)}
              />
            ) : (
              <div className="px-4 py-4 pb-32 max-w-2xl w-full mx-auto">
                <BriefView
                  tasks={taskStore.tasks}
                  loading={false}
                  completeTask={taskStore.completeTask}
                  completeTaskDay={taskStore.completeTaskDay}
                  uncompleteTaskDay={taskStore.uncompleteTaskDay}
                  reopenTask={taskStore.reopenTask}
                  updateTask={taskStore.updateTask}
                  onEdit={setEditTask}
                  categoryStore={categoryStore}
                  weeklyStore={weeklyStore}
                  customize={customize}
                />
              </div>
            )}
          </main>
        </div>
        {editTask && (
          <TaskForm
            initial={editTask}
            categories={categoryStore.categories}
            onClose={() => setEditTask(null)}
            onSubmit={async (input) => {
              await taskStore.updateTask(editTask.id, input);
            }}
            onDelete={async () => {
              await taskStore.deleteTask(editTask.id);
            }}
            onComplete={taskStore.completeTask}
          />
        )}
      </div>
    </ChecklistContext.Provider>
  );
}
