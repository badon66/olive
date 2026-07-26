import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { z } from "npm:zod@3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const SetupSchema = z.object({
  wake_time: hhmm.nullable().default(null), // null = keep the 11:00 default
  blocked_windows: z
    .array(z.object({ start: hhmm, end: hhmm, label: z.string().min(1).max(60) }))
    .max(8)
    .default([]),
  reply: z.string().min(1),
});

const SETUP_TOOL = {
  name: "return_setup",
  description: "Return tomorrow's wake time and any blocked windows parsed from the user's blurb.",
  input_schema: {
    type: "object",
    required: ["wake_time", "blocked_windows", "reply"],
    properties: {
      wake_time: { type: ["string", "null"], description: "HH:MM 24h, or null if the user didn't mention waking" },
      blocked_windows: {
        type: "array",
        items: {
          type: "object",
          required: ["start", "end", "label"],
          properties: {
            start: { type: "string", description: "HH:MM 24h" },
            end: { type: "string", description: "HH:MM 24h" },
            label: { type: "string" },
          },
        },
      },
      reply: { type: "string", description: "One-line confirmation of what was understood" },
    },
  },
} as const;

// Relative to the 1:30 AM day boundary (matches src/lib/dates.ts): before 1:30
// "today" is still yesterday, so "tomorrow" is only +0 from the calendar date.
function edmontonTomorrow(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const mins = (Number(parts.find((p) => p.type === "hour")!.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const [y, m, d] = date.split("-").map(Number);
  const offset = mins >= 90 ? 1 : 0; // before 1:30 AM, "today" is still yesterday
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const { blurb, date } = await req.json();
    if (typeof blurb !== "string" || !blurb.trim()) {
      return Response.json({ error: "empty blurb" }, { status: 400, headers: CORS });
    }
    const targetDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : edmontonTomorrow();

    const system = [
      "You parse a short blurb about tomorrow's schedule into a wake time and blocked windows.",
      "Times are 24h HH:MM. 'up around 9' → wake_time 09:00. 'dentist 2 to 3:30' → 14:00–15:30 labeled 'dentist'.",
      "Assume afternoon for ambiguous small hours in appointments (2 → 14:00) unless clearly morning.",
      "If no wake time is mentioned, wake_time is null (the app keeps its 11:00 default).",
      "Return via the return_setup tool.",
    ].join("\n");

    const raw = await callClaude({ system, user: blurb, tool: SETUP_TOOL, toolName: "return_setup" });
    const setup = SetupSchema.parse(raw);

    const { error } = await supabase.from("daily_schedule_setup").upsert(
      {
        user_id: user.id,
        date: targetDate,
        wake_time: setup.wake_time ?? "11:00",
        blocked_windows: setup.blocked_windows,
        raw_blurb: blurb,
      },
      { onConflict: "user_id,date" },
    );
    if (error) throw error;

    return Response.json(
      { date: targetDate, wake_time: setup.wake_time ?? "11:00", blocked_windows: setup.blocked_windows, reply: setup.reply },
      { headers: CORS },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "setup failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
