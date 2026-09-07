import { serviceClient, userClient } from "../_shared/supabase.ts";
import { dueOccurrence, type ReminderLike } from "../_shared/reminders.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Server-side reminder tick (pg_cron, every 5 minutes).
//
// It records that an occurrence CAME DUE by inserting a reminder_fires row, and
// advances the schedule anchor. It deliberately does not try to deliver
// anything: the row is the durable evidence, and whichever surface can actually
// reach Keenan raises the alert from it. Today that is the open app; from Phase
// 8 it will also be the Telegram bot.
//
// Writing a fire row rather than only stamping last_fired_at is what fixes the
// old hole: the previous version consumed an occurrence whether or not anyone
// was watching, so anything that came due while the app was closed was silently
// swallowed and never alerted.
//
// HONEST LIMIT (BUILD_PLAN Phase 2): reliable off-app delivery is still Phase 8.
// Deliberately not faked with browser push here.
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

    // The global master switch is honoured HERE, not only in the UI. Without
    // this the tick would keep banking fire rows while reminders are switched
    // off, and every one of them would alert at once when it came back on.
    const { data: settings } = await db
      .from("app_settings")
      .select("reminders_globally_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings && settings.reminders_globally_enabled === false) {
      return Response.json({ ok: true, skipped: "reminders globally disabled" }, { headers: CORS });
    }

    const { data: rows, error } = await db
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) throw error;

    const now = new Date();
    const raised: string[] = [];

    for (const r of (rows ?? []) as unknown as (ReminderLike & { id: string; name: string })[]) {
      const at = dueOccurrence(r, now);
      if (!at) continue;

      // Idempotent by (reminder_id, occurrence_at): an open browser may already
      // have raised this exact occurrence, and it must not alert twice.
      const { error: fireErr } = await db.from("reminder_fires").upsert(
        {
          user_id: userId,
          reminder_id: r.id,
          occurrence_at: at.toISOString(),
          fired_at: now.toISOString(),
        },
        { onConflict: "reminder_id,occurrence_at", ignoreDuplicates: true },
      );
      if (fireErr) {
        console.error("fire insert failed", r.id, fireErr);
        continue;
      }

      // Anchor on the OCCURRENCE, not on "now", so a late tick cannot drag the
      // cadence progressively later.
      await db.from("reminders").update({ last_fired_at: at.toISOString() }).eq("id", r.id);
      raised.push(r.name);

      // A one-time reminder has nothing left to schedule once it has fired.
      if (r.recurrence_type === "one_time") {
        await db.from("reminders").update({ active: false }).eq("id", r.id);
      }
    }

    return Response.json(
      {
        ok: true,
        fired: raised.length,
        names: raised,
        delivery: "fire rows recorded; in-app alerts until Phase 8 Telegram",
      },
      { headers: CORS },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "reminder tick failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
