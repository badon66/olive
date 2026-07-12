import { supabase } from "./supabase";

// One parsed assistant action, as returned by preview mode and accepted by
// commit mode. Field names mirror supabase/functions/_shared/actions.ts.
export type AssistantAction = {
  type: "create_task" | "update_task" | "complete_task" | "delete_task" | "create_category" | "add_memory";
  title?: string;
  category_name?: string;
  due_date?: string | null;
  priority_weight?: number;
  time_section?: string | null;
  duration_minutes?: number | null;
  scheduled_time?: string | null;
  task_id?: string;
  name?: string;
  color?: string | null;
  content?: string;
  date?: string | null;
  tags?: string[];
};

// Typed text: parse + execute in one step
export async function sendToAssistant(message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("assistant", { body: { message } });
  if (error) throw new Error(error.message);
  return data.reply as string;
}

// Voice: parse only — nothing is saved until commitAssistant
export async function previewAssistant(message: string): Promise<{ actions: AssistantAction[]; reply: string }> {
  const { data, error } = await supabase.functions.invoke("assistant", { body: { message, mode: "preview" } });
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

export async function cleanJournal(raw: string): Promise<{ cleaned_text: string; tags: string[] }> {
  const { data, error } = await supabase.functions.invoke("journal-clean", { body: { raw } });
  if (error) throw new Error(error.message);
  return data as { cleaned_text: string; tags: string[] };
}

export type BlockedWindow = { start: string; end: string; label: string };

export async function submitScheduleSetup(blurb: string): Promise<{
  date: string;
  wake_time: string;
  blocked_windows: BlockedWindow[];
  reply: string;
}> {
  const { data, error } = await supabase.functions.invoke("schedule-setup", { body: { blurb } });
  if (error) throw new Error(error.message);
  return data;
}
