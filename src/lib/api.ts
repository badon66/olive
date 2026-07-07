import { supabase } from "./supabase";

export async function sendToAssistant(message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("assistant", { body: { message } });
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
