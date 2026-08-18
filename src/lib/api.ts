import { supabase } from "./supabase";

// One parsed assistant action, as returned by preview mode and accepted by
// commit mode. Field names mirror supabase/functions/_shared/actions.ts.
export type AssistantAction = {
  type:
    | "create_task"
    | "update_task"
    | "complete_task"
    | "delete_task"
    | "create_category"
    | "create_job"
    | "update_job"
    | "create_reminder"
    | "add_memory";
  title?: string;
  description?: string | null;
  category_name?: string;
  due_date?: string | null;
  priority_weight?: number;
  time_section?: string | null;
  duration_minutes?: number | null;
  scheduled_time?: string | null;
  task_id?: string;
  job_id?: string | null;
  status?: string;
  notes?: string | null;
  // create_reminder
  recurrence_type?: string;
  fire_at?: string | null;
  interval_minutes?: number | null;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  time_of_day?: string | null;
  name?: string;
  color?: string | null;
  content?: string;
  date?: string | null;
  tags?: string[];
};

// Scopes a capture to a job: the assistant links created tasks to it and polishes
// their wording. category_name lets the task inherit the job's header.
export type JobContext = { id: string; name: string; category_name?: string | null };

// Extra capture context: scope to a job, and/or default undated tasks to a date
// (the schedule-setup popup adds tasks "for tomorrow").
export type CaptureContext = { job?: JobContext; forDate?: string };

// Typed text: parse + execute in one step
export async function sendToAssistant(message: string, ctx?: CaptureContext): Promise<string> {
  const { data, error } = await supabase.functions.invoke("assistant", {
    body: { message, job: ctx?.job, for_date: ctx?.forDate },
  });
  if (error) throw new Error(error.message);
  return data.reply as string;
}

// Voice (or a job's capture box): parse only — nothing is saved until commitAssistant
export async function previewAssistant(
  message: string,
  ctx?: CaptureContext,
): Promise<{ actions: AssistantAction[]; reply: string }> {
  const { data, error } = await supabase.functions.invoke("assistant", {
    body: { message, mode: "preview", job: ctx?.job, for_date: ctx?.forDate },
  });
  if (error) throw new Error(error.message);
  return { actions: data.actions as AssistantAction[], reply: data.reply as string };
}

export async function commitAssistant(actions: AssistantAction[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke("assistant", { body: { mode: "commit", actions } });
  if (error) throw new Error(error.message);
  return data.reply as string;
}

export async function generateBrief(): Promise<void> {
  const { error } = await supabase.functions.invoke("daily-brief", { body: {} });
  if (error) throw new Error(error.message);
}

export type BlockedWindow = { start: string; end: string; label: string };

export type ScheduleSetupInput = {
  date?: string;
  wake_time: string | null;
  bedtime: string | null;
  going_selling: boolean;
  // Natural-language blocked windows ("dentist 2 to 3:30") — parsed server-side.
  blocked_windows_blurb: string;
};

export async function submitScheduleSetup(input: ScheduleSetupInput): Promise<{
  date: string;
  wake_time: string;
  bedtime: string | null;
  going_selling: boolean;
  blocked_windows: BlockedWindow[];
}> {
  const { data, error } = await supabase.functions.invoke("schedule-setup", { body: input });
  if (error) throw new Error(error.message);
  return data;
}
