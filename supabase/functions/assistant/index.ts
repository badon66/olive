import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { APPLY_ACTIONS_TOOL, PlanSchema, type Plan } from "../_shared/actions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PALETTE = ["#4a9eff", "#f5c518", "#52c41a", "#ff8a5b", "#c084fc", "#38bdf8", "#fb7185", "#facc15"];

// The day flips at 01:30 Edmonton, not midnight (matches src/lib/dates.ts):
// a task captured at 1 AM still belongs to the previous day.
function edmontonToday(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Edmonton",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const mins = (Number(parts.find((p) => p.type === "hour")!.value) % 24) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  if (mins >= 90) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function edmontonWeekday(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", weekday: "long" }).format(new Date());
}

// Modes: "preview" parses and returns the plan WITHOUT touching the DB (voice
// preview-before-send); "commit" executes a client-supplied (possibly edited)
// plan; "direct" (default) parses and executes in one step — the typed-text path.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const body = await req.json();
    const mode: "preview" | "commit" | "direct" = body.mode === "preview" || body.mode === "commit" ? body.mode : "direct";

    let plan: Plan;
    if (mode === "commit") {
      plan = PlanSchema.parse({ actions: body.actions, reply: body.reply ?? "Done." });
    } else {
      const message = body.message;
      if (typeof message !== "string" || !message.trim()) {
        return Response.json({ error: "empty message" }, { status: 400, headers: CORS });
      }

      const [{ data: openTasks }, { data: categories }] = await Promise.all([
        supabase.from("tasks").select("id,title,due_date,priority_weight,category_id").eq("status", "open"),
        supabase.from("categories").select("id,name"),
      ]);
      const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

      const system = [
        `You are Olive, a personal task assistant. Today (America/Edmonton) is ${edmontonWeekday()}, ${edmontonToday()}.`,
        "The day rolls over at 1:30am: anything captured before 1:30am still belongs to the previous day.",
        "Convert the user's message into actions via the apply_actions tool.",
        "CATEGORIES (user-defined; use category_name exactly as listed, default 'Personal'):",
        ...(categories ?? []).map((c) => `- ${c.name}`),
        "To create a new category/section ('make a new section called Groceries') use create_category;",
        "a create_task may also reference a brand-new category_name and it will be created automatically.",
        "For update/complete/delete, pick task_id ONLY from OPEN TASKS below (match loosely on wording).",
        "If the message references a task you cannot find, return zero actions and say so in reply.",
        "Resolve relative dates ('Friday', 'next week') to YYYY-MM-DD using today's date; 'Friday' means the next upcoming Friday.",
        "scheduled_time is ONLY for fixed appointments ('dentist at 2:30'); time_section is the loose part of day.",
        "time_section values: morning, midday, afternoon, evening, night (late evening through the small hours), anytime.",
        "Use add_memory only when the user asks to remember/note something that is not a task.",
        "OPEN TASKS:",
        ...(openTasks ?? []).map(
          (t) => `${t.id} | ${t.title} | ${catName.get(t.category_id) ?? "?"} | due ${t.due_date ?? "none"} | p${t.priority_weight}`,
        ),
      ].join("\n");

      const raw = await callClaude({ system, user: message, tool: APPLY_ACTIONS_TOOL, toolName: "apply_actions" });
      plan = PlanSchema.parse(raw); // zod gate — invalid LLM output stops here

      if (mode === "preview") {
        // Nothing saved yet — the client shows the breakdown for editing first
        return Response.json({ preview: true, actions: plan.actions, reply: plan.reply }, { headers: CORS });
      }
    }

    // ---- execute ----
    const { data: cats } = await supabase.from("categories").select("id,name,color");
    const categoriesByLower = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c]));

    const resolveCategory = async (name: string): Promise<{ id: string; name: string }> => {
      const hit = categoriesByLower.get(name.toLowerCase());
      if (hit) return hit;
      const color = PALETTE[categoriesByLower.size % PALETTE.length];
      const { data, error } = await supabase
        .from("categories")
        .insert({ name, color, user_id: user.id })
        .select("id,name,color")
        .single();
      if (error) throw error;
      categoriesByLower.set(name.toLowerCase(), data);
      return data;
    };

    const confirmations: string[] = [];
    for (const a of plan.actions) {
      if (a.type === "create_task") {
        const cat = await resolveCategory(a.category_name);
        const { error } = await supabase.from("tasks").insert({
          user_id: user.id,
          title: a.title,
          category_id: cat.id,
          due_date: a.due_date,
          priority_weight: a.priority_weight,
          time_section: a.time_section,
          duration_minutes: a.duration_minutes,
          scheduled_time: a.scheduled_time,
        });
        if (error) throw error;
        confirmations.push(`Added task: ${a.title} (${cat.name}${a.due_date ? ", due " + a.due_date : ""})`);
      } else if (a.type === "update_task") {
        const { type: _t, task_id, category_name, ...rest } = a;
        const patch: Record<string, unknown> = { ...rest };
        if (category_name) patch.category_id = (await resolveCategory(category_name)).id;
        const { data, error } = await supabase.from("tasks").update(patch).eq("id", task_id).select("title").single();
        if (error) throw error;
        confirmations.push(`Updated: ${data.title}`);
      } else if (a.type === "complete_task") {
        const { data, error } = await supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", a.task_id)
          .select("title")
          .single();
        if (error) throw error;
        confirmations.push(`Completed: ${data.title}`);
      } else if (a.type === "delete_task") {
        const { data, error } = await supabase.from("tasks").delete().eq("id", a.task_id).select("title").single();
        if (error) throw error;
        confirmations.push(`Deleted: ${data.title}`);
      } else if (a.type === "create_category") {
        const before = categoriesByLower.has(a.name.toLowerCase());
        if (a.color && !before) {
          const { data, error } = await supabase
            .from("categories")
            .insert({ name: a.name, color: a.color, user_id: user.id })
            .select("id,name,color")
            .single();
          if (error) throw error;
          categoriesByLower.set(a.name.toLowerCase(), data);
        } else {
          await resolveCategory(a.name);
        }
        confirmations.push(before ? `Section already exists: ${a.name}` : `New section: ${a.name}`);
      } else if (a.type === "add_memory") {
        const { error } = await supabase.from("memories").insert({
          user_id: user.id,
          content: a.content,
          date: a.date,
          tags: a.tags,
        });
        if (error) throw error;
        confirmations.push(`Noted: ${a.content}`);
      }
    }

    return Response.json(
      { reply: confirmations.length ? confirmations.join("\n") : plan.reply },
      { headers: CORS },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "assistant failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
