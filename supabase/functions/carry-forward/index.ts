// REMOVED — carryover is manual (BUILD_PLAN correction).
//
// This function used to bump overdue `auto_carry_forward` tasks onto the new day
// at the rollover, driven by the pg_cron job `olive-carry-forward`. That was
// wrong: tasks must STAY on their original date and sit in the "Carryover Tasks"
// dropdown until the user drags them onto a day/section or edits the date.
//
// The cron job and the `carried_forward_on` column are gone (migration
// 20260813000003). This tombstone remains only because the deploy tooling has no
// delete; it touches no data and calls nothing. Delete the function from the
// Supabase dashboard to remove it entirely.
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "gone",
      detail: "carry-forward was removed — carryover is manual, nothing bumps due_date.",
    }),
    { status: 410, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
  ),
);
