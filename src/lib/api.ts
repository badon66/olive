import { db } from "./db";

/**
 * Call one of Olive's server functions.
 *
 * This used to be `db.functions.invoke(...)`, which was Supabase's client
 * doing three things at once: knowing where the functions lived, attaching the
 * user's JWT, and unwrapping the response. Neon's client doesn't bundle a
 * function invoker, so those three things are here instead — and the base URL
 * is an environment variable, which means the functions can move between hosts
 * without touching a line of this file.
 *
 * The bearer token is the Neon Auth session JWT. The functions must verify it
 * against Neon's JWKS; a function that skips that check is open to the
 * internet, because these endpoints are called from a browser.
 */
async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const base = import.meta.env.VITE_FUNCTIONS_URL;
  if (!base) {
    throw new Error(
      "Missing VITE_FUNCTIONS_URL — the assistant, brief and schedule functions have nowhere to be called.",
    );
  }

  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${base.replace(/\/$/, "")}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  // Read the body once, then decide — a failed function often replies with
  // plain text, and calling .json() on that throws a parse error that hides
  // the actual message.
  const text = await res.text();
  if (!res.ok) {
    let message = text || `${name} failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error ?? parsed.message ?? message;
    } catch {
      /* not JSON — use the raw text */
    }
    throw new Error(message);
  }

  return (text ? JSON.parse(text) : null) as T;
}

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
  const data = await invokeFunction<{ reply: string }>("assistant", {
    message,
    job: ctx?.job,
    for_date: ctx?.forDate,
  });
  return data.reply;
}

// Voice (or a job's capture box): parse only — nothing is saved until commitAssistant
export async function previewAssistant(
  message: string,
  ctx?: CaptureContext,
): Promise<{ actions: AssistantAction[]; reply: string }> {
  const data = await invokeFunction<{ actions: AssistantAction[]; reply: string }>("assistant", {
    message,
    mode: "preview",
    job: ctx?.job,
    for_date: ctx?.forDate,
  });
  return { actions: data.actions, reply: data.reply };
}

export async function commitAssistant(actions: AssistantAction[]): Promise<string> {
  const data = await invokeFunction<{ reply: string }>("assistant", { mode: "commit", actions });
  return data.reply;
}

export async function generateBrief(): Promise<void> {
  await invokeFunction<unknown>("daily-brief", {});
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
  return invokeFunction<{
    date: string;
    wake_time: string;
    bedtime: string | null;
    going_selling: boolean;
    blocked_windows: BlockedWindow[];
  }>("schedule-setup", input);
}
