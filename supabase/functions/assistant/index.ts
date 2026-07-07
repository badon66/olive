import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { APPLY_ACTIONS_TOOL, PlanSchema } from "../_shared/actions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personal",
  powerplay: "PowerPlay",
  alberta_premium: "Alberta Premium",
};

function edmontonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date());
}

function edmontonWeekday(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Edmonton", weekday: "long" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const { message } = await req.json();
    if (typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "empty message" }, { status: 400, headers: CORS });
    }

    const { data: openTasks } = await supabase
      .from("tasks")
      .select("id,title,category,due_date,priority_weight")
      .eq("status", "open");

    const system = [
      `You are Olive, a personal task assistant. Today (America/Edmonton) is ${edmontonWeekday()}, ${edmontonToday()}.`,
      "Convert the user's message into actions via the apply_actions tool.",
      "Categories: personal (default), powerplay (PowerPlay coatings business), alberta_premium (Alberta Premium job).",
      "For update/complete/delete, pick task_id ONLY from OPEN TASKS below (match loosely on wording).",
      "If the message references a task you cannot find, return zero actions and say so in reply.",
      "Resolve relative dates ('Friday', 'next week') to YYYY-MM-DD using today's date; 'Friday' means the next upcoming Friday.",
      "Use add_memory only when the user asks to remember/note something that is not a task.",
      "OPEN TASKS:",
      ...(openTasks ?? []).map(
        (t) => `${t.id} | ${t.title} | ${t.category} | due ${t.due_date ?? "none"} | p${t.priority_weight}`,
      ),
    ].join("\n");

    const raw = await callClaude({ system, user: message, tool: APPLY_ACTIONS_TOOL, toolName: "apply_actions" });
    const plan = PlanSchema.parse(raw); // zod gate — invalid LLM output stops here

    const confirmations: string[] = [];
    for (const a of plan.actions) {
      if (a.type === "create_task") {
        const { error } = await supabase.from("tasks").insert({
          user_id: user.id,
          title: a.title,
          category: a.category,
          due_date: a.due_date,
          priority_weight: a.priority_weight,
        });
        if (error) throw error;
        confirmations.push(
          `Added task: ${a.title} (${CATEGORY_LABELS[a.category]}${a.due_date ? ", due " + a.due_date : ""})`,
        );
      } else if (a.type === "update_task") {
        const { type: _t, task_id, ...patch } = a;
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
