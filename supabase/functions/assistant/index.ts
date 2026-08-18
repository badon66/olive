import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { APPLY_ACTIONS_TOOL, PlanSchema, type Plan } from "../_shared/actions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PALETTE = ["#4a9eff", "#f5c518", "#52c41a", "#ff8a5b", "#c084fc", "#38bdf8", "#fb7185", "#facc15"];

// VIEW day — flips at 01:30 Edmonton, matching src/lib/dates.ts `edmontonToday`.
// This is "what date is it" for parsing ("Friday", "tomorrow"), so it tracks the
// page boundary, not the 5:00 AM one that governs which Night is still running.
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

      // Optional job-scoping context (from a job's own capture box): every task
      // parsed gets stamped onto this job and its wording polished.
      const jobCtx =
        body.job && typeof body.job.id === "string"
          ? {
              id: body.job.id as string,
              name: typeof body.job.name === "string" ? body.job.name : "this job",
              category_name: typeof body.job.category_name === "string" ? body.job.category_name : null,
            }
          : null;

      // Optional default date (schedule-setup "add tasks for tomorrow"): undated
      // new tasks land on this date unless the user names another.
      const forDate =
        typeof body.for_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.for_date) ? body.for_date : null;

      const [{ data: openTasks }, { data: categories }, { data: jobs }] = await Promise.all([
        supabase.from("tasks").select("id,title,due_date,priority_weight,category_id").eq("status", "open"),
        supabase.from("categories").select("id,name"),
        supabase.from("active_jobs").select("id,name,status,category_id"),
      ]);
      const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

      const system = [
        `You are Olive, a personal task assistant. Today (America/Edmonton) is ${edmontonWeekday()}, ${edmontonToday()}.`,
        "The date above already accounts for the 1:30am day rollover — anything captured before 1:30am still counts as the previous day.",
        "Convert the user's message into actions via the apply_actions tool.",
        "CATEGORIES (user-defined; use category_name exactly as listed, default 'Personal'):",
        ...(categories ?? []).map((c) => `- ${c.name}`),
        "To create a new category/section ('make a new section called Groceries') use create_category;",
        "a create_task may also reference a brand-new category_name and it will be created automatically.",
        "For update/complete/delete, pick task_id ONLY from OPEN TASKS below (match loosely on wording).",
        "If the message references a task you cannot find, return zero actions and say so in reply.",
        "Resolve relative dates ('Friday', 'next week') to YYYY-MM-DD using today's date; 'Friday' means the next upcoming Friday.",
        "scheduled_time is ONLY for fixed appointments ('dentist at 2:30'); time_section is the loose part of day.",
        "time_section values: morning, midday, afternoon, evening, night (11 PM to 5 AM), anytime.",
        "JOBS: 'add a job, Dennis's driveway' -> create_job (name is the specific job; category_name is the company/header if named, else null).",
        "'mark the Flames job paid' / 'the driveway is sold' -> update_job with job_id from ACTIVE JOBS and the new status (quoted/sold/in_progress/paid).",
        "REMINDERS: 'remind me to X ...' -> create_reminder. Pick recurrence_type from the phrasing:",
        "  'in 30 minutes' / 'at 4pm tomorrow' -> one_time with fire_at (full ISO timestamp, Edmonton local resolved to UTC).",
        "  'every 30 minutes' / 'every 2 hours' -> interval with interval_minutes.",
        "  'every day at 9' -> daily with time_of_day. 'every Monday and Friday at 5' -> weekly with days_of_week (0=Mon..6=Sun) + time_of_day.",
        "  'on the 1st of every month' -> monthly with day_of_month + time_of_day.",
        "Only set the fields that shape needs; leave the rest null.",
        "Use add_memory only when the user asks to remember/note something that is not a task.",
        forDate ? `These new tasks are for ${forDate} — set due_date to it unless the user clearly names a different day.` : "",
        // Job-scoped capture: the whole message is one or more tasks for this job.
        ...(jobCtx
          ? [
              `TASK-FOR-JOB MODE: everything the user says is a task (or tasks) for the job "${jobCtx.name}". Use create_task only.`,
              "Rewrite each into a clear, concise, specific task title (imperative voice, no filler) — this is the point, polish their wording.",
              jobCtx.category_name
                ? `Set category_name to "${jobCtx.category_name}" unless the user clearly names a different one.`
                : "",
            ].filter(Boolean)
          : []),
        "OPEN TASKS:",
        ...(openTasks ?? []).map(
          (t) => `${t.id} | ${t.title} | ${catName.get(t.category_id) ?? "?"} | due ${t.due_date ?? "none"} | p${t.priority_weight}`,
        ),
        "ACTIVE JOBS:",
        ...(jobs ?? []).map((j) => `${j.id} | ${j.name} | ${j.status} | ${catName.get(j.category_id ?? "") ?? "no header"}`),
      ].join("\n");

      const raw = await callClaude({ system, user: message, tool: APPLY_ACTIONS_TOOL, toolName: "apply_actions" });
      plan = PlanSchema.parse(raw); // zod gate — invalid LLM output stops here

      // Stamp job link / default date server-side so they survive preview ->
      // commit even if the model omits them (commit re-sends only the actions).
      for (const a of plan.actions) {
        if (a.type !== "create_task") continue;
        if (jobCtx) a.job_id = jobCtx.id;
        if (forDate && a.due_date === null) a.due_date = forDate;
      }

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
          description: a.description,
          category_id: cat.id,
          due_date: a.due_date,
          priority_weight: a.priority_weight,
          time_section: a.time_section,
          duration_minutes: a.duration_minutes,
          scheduled_time: a.scheduled_time,
          job_id: a.job_id,
          auto_carry_forward: a.auto_carry_forward,
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
      } else if (a.type === "create_job") {
        const cat = a.category_name ? await resolveCategory(a.category_name) : null;
        const { error } = await supabase.from("active_jobs").insert({
          user_id: user.id,
          name: a.name,
          status: a.status,
          category_id: cat?.id ?? null,
          notes: a.notes,
        });
        if (error) throw error;
        confirmations.push(`Added job: ${a.name}${cat ? " (" + cat.name + ")" : ""}`);
      } else if (a.type === "update_job") {
        const { type: _t, job_id, category_name, ...rest } = a;
        const patch: Record<string, unknown> = { ...rest };
        if (category_name) patch.category_id = (await resolveCategory(category_name)).id;
        const { data, error } = await supabase
          .from("active_jobs")
          .update(patch)
          .eq("id", job_id)
          .select("name,status")
          .single();
        if (error) throw error;
        confirmations.push(`Updated job: ${data.name} → ${data.status}`);
      } else if (a.type === "create_reminder") {
        const { type: _t, ...fields } = a;
        const { error } = await supabase.from("reminders").insert({ user_id: user.id, ...fields });
        if (error) throw error;
        confirmations.push(`Reminder set: ${a.name}`);
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
