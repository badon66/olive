import { createContext, useContext } from "react";
import type { CategoryStore } from "../../hooks/useCategories";
import type { Job, JobStore } from "../../hooks/useJobs";
import type { Reminder, ReminderStore } from "../../hooks/useReminders";
import type { Task, TaskStore } from "../../hooks/useTasks";
import type { WeeklyStore, WeeklyTask } from "../../hooks/useWeeklyTasks";
import type { TimeSection } from "../../lib/sections";

// What every phone screen shares. The STORES are the exact same objects the
// desktop uses (BUILD_PLAN "same brain, different face") — the phone only adds
// presentation state: which tab, which day, which sheet is open.

export type PhoneTab = "now" | "today" | "reminders" | "finance" | "more";
export type MorePage = "weekly" | "upcoming" | "jobs" | "tasks" | "settings";

export type Sheet =
  | { kind: "task"; task: Task; date: string }
  | { kind: "weekly"; weekly: WeeklyTask; date: string }
  | { kind: "editTask"; task: Task }
  | { kind: "addTask"; defaults: { due_date?: string; job_id?: string; category_id?: string } }
  | { kind: "editWeekly"; weekly: WeeklyTask; date: string }
  | { kind: "addWeekly" }
  | { kind: "job"; jobId: string }
  | { kind: "editJob"; job: Job | null }
  | { kind: "reminder"; reminder: Reminder | null }
  | { kind: "capture" };

export type PhoneCtx = {
  taskStore: TaskStore;
  weeklyStore: WeeklyStore;
  categoryStore: CategoryStore;
  jobStore: JobStore;
  reminderStore: ReminderStore;
  // Clocks — the same two boundaries as desktop: `today` is the page (1:30 AM),
  // `activeDay` the day whose Night is still running (5:00 AM).
  now: Date;
  today: string;
  activeDay: string;
  nowSection: TimeSection;
  nowMinutes: number;
  open: Task[];
  customize: boolean;
  // Today tab's day (offset from today), also the capture default date.
  dayOffset: number;
  setDayOffset: (fn: (o: number) => number) => void;
  viewDate: string;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  goTab: (tab: PhoneTab, page?: MorePage | null) => void;
  // Shows a toast; with `undo`, a "Completed · Undo" toast for 5 seconds.
  toast: (text: string, undo?: () => void) => void;
  // Complete/reopen with the undo safety net — the same store writes desktop uses.
  toggleTask: (task: Task, date: string) => void;
  toggleWeekly: (weekly: WeeklyTask, date: string, done: boolean) => void;
};

export const PhoneContext = createContext<PhoneCtx | null>(null);

export function usePhone(): PhoneCtx {
  const ctx = useContext(PhoneContext);
  if (!ctx) throw new Error("usePhone outside the phone shell");
  return ctx;
}
