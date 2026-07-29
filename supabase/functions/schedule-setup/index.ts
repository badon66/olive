import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { z } from "npm:zod@3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
// The form supplies wake/bedtime/going_selling directly; only the blocked-windows
// blurb needs the LLM. This schema validates that parse.
const ParseSchema = z.object({
  blocked_windows: z
    .array(z.object({ start: hhmm, end: hhmm, label: z.string().min(1).max(60) }))
    .max(8)
    .default([]),
});

const PARSE_TOOL = {
  name: "return_blocked_windows",
  description: "Extract blocked time windows from the blurb.",
  input_schema: {
    type: "object",
    required: ["blocked_windows"],
    properties: {
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
  const offset = mins >= 90 ? 1 : 0;
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const body = await req.json();
    const targetDate =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : edmontonTomorrow();
    const wake_time = typeof body.wake_time === "string" && /^\d{2}:\d{2}$/.test(body.wake_time) ? body.wake_time : null;
    const bedtime = typeof body.bedtime === "string" && /^\d{2}:\d{2}$/.test(body.bedtime) ? body.bedtime : null;
    const going_selling = body.going_selling === true;
    const blurb = typeof body.blocked_windows_blurb === "string" ? body.blocked_windows_blurb.trim() : "";

    let blocked_windows: unknown[] = [];
    if (blurb) {
      const system = [
        "Extract blocked time windows from the blurb into HH:MM 24h start/end plus a short label.",
        "'dentist 2 to 3:30' -> 14:00-15:30 labeled 'dentist'. Assume afternoon for ambiguous small hours unless clearly morning.",
        "If nothing is actually blocked, return an empty array. Return via return_blocked_windows.",
      ].join("\n");
      const raw = await callClaude({ system, user: blurb, tool: PARSE_TOOL, toolName: "return_blocked_windows" });
      blocked_windows = ParseSchema.parse(raw).blocked_windows;
    } else {
      // No new blurb — preserve any blocked windows already set for that day so an
      // update to wake/bedtime/selling doesn't silently wipe them.
      const { data: existing } = await supabase
        .from("daily_schedule_setup")
        .select("blocked_windows")
        .eq("date", targetDate)
        .maybeSingle();
      blocked_windows = (existing?.blocked_windows ?? []) as unknown[];
    }

    const { error } = await supabase.from("daily_schedule_setup").upsert(
      {
        user_id: user.id,
        date: targetDate,
        wake_time: wake_time ?? "11:00",
        bedtime,
        going_selling,
        blocked_windows,
        raw_blurb: blurb || null,
      },
      { onConflict: "user_id,date" },
    );
    if (error) throw error;

    return Response.json(
      { date: targetDate, wake_time: wake_time ?? "11:00", bedtime, going_selling, blocked_windows },
      { headers: CORS },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "setup failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
