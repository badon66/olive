import { serviceClient, userClient } from "../_shared/supabase.ts";
import { buildBrief, buildJobsBrief, edmontonHour, edmontonToday } from "../_shared/brief.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Cron path authenticates via x-cron-secret, checked against Vault (service-role-only RPC)
    const headerSecret = req.headers.get("x-cron-secret");
    let isCron = false;
    if (headerSecret) {
      const svc = serviceClient();
      const { data: secret } = await svc.rpc("get_cron_secret");
      isCron = typeof secret === "string" && secret.length > 0 && headerSecret === secret;
    }
    let db;
    let userId: string;

    if (isCron) {
      // Cron fires at 13:00 and 14:00 UTC; only the one matching 7am Edmonton proceeds (DST-proof).
      if (edmontonHour() !== 7) {
        return Response.json({ skipped: "not 7am Edmonton" }, { headers: CORS });
      }
      db = serviceClient();
      const { data: users, error } = await db.from("app_user").select("user_id").limit(1);
      if (error || !users?.length) throw error ?? new Error("no user");
      userId = users[0].user_id;
    } else {
      db = userClient(req);
      const { data: { user } } = await db.auth.getUser();
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
      userId = user.id;
    }

    const today = edmontonToday();
    const [{ data: tasks, error: terr }, { data: jobs, error: jerr }] = await Promise.all([
      db.from("tasks").select("id,due_date,priority_weight,created_at").eq("user_id", userId).eq("status", "open"),
      db.from("active_jobs").select("name,status,updated_at").eq("user_id", userId),
    ]);
    if (terr) throw terr;
    if (jerr) throw jerr;

    const content = { ...buildBrief(tasks ?? [], today), jobs: buildJobsBrief(jobs ?? [], today) };
    // upsert deliberately does NOT touch manual_order — regeneration never clobbers the user's reorder
    const { error } = await db.from("daily_briefs").upsert(
      { user_id: userId, brief_date: today, content, generated_at: new Date().toISOString() },
      { onConflict: "user_id,brief_date" },
    );
    if (error) throw error;

    return Response.json({ ok: true, brief_date: today }, { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "brief failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
