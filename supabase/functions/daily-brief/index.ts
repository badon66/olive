import { serviceClient, userClient } from "../_shared/supabase.ts";
import { buildBrief, edmontonHour, edmontonToday } from "../_shared/brief.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
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
    const { data: tasks, error: terr } = await db
      .from("tasks")
      .select("id,due_date,priority_weight,created_at")
      .eq("user_id", userId)
      .eq("status", "open");
    if (terr) throw terr;

    const content = buildBrief(tasks ?? [], today);
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
