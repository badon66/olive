import { serviceClient, userClient } from "../_shared/supabase.ts";
import { dueReminders, type ReminderLike } from "../_shared/reminders.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Server-side reminder tick. Marks due reminders as fired so the schedule
// advances even while the app is closed, and returns what came due.
//
// HONEST LIMIT (BUILD_PLAN Phase 2): this keeps the SCHEDULE correct, it does
// not deliver anything to the user off-app. Actually reaching Keenan when he
// isn't looking at the screen is the Telegram bot in Phase 8 — deliberately not
// faked with browser push here.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const headerSecret = req.headers.get("x-cron-secret");
    let isCron = false;
    if (headerSecret) {
      const { data: secret } = await serviceClient().rpc("get_cron_secret");
      isCron = typeof secret === "string" && secret.length > 0 && headerSecret === secret;
    }

    let db;
    let userId: string;
    if (isCron) {
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

    const { data: rows, error } = await db
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) throw error;

    const now = new Date();
    const due = dueReminders((rows ?? []) as unknown as (ReminderLike & { id: string; name: string })[], now);

    if (due.length > 0) {
      const iso = now.toISOString();
      await Promise.all(
        due.map((r) => db.from("reminders").update({ last_fired_at: iso }).eq("id", r.id)),
      );
      // A one-time reminder has nothing left to do once it has fired.
      const oneTime = due.filter((r) => r.recurrence_type === "one_time").map((r) => r.id);
      if (oneTime.length > 0) await db.from("reminders").update({ active: false }).in("id", oneTime);
    }

    return Response.json(
      { ok: true, fired: due.length, names: due.map((r) => r.name), delivery: "in-app only until Phase 8" },
      { headers: CORS },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "reminder tick failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
