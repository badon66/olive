-- Job status becomes THREE independent dimensions instead of one flat enum.
-- The old single `status` conflated a sale stage, a work stage, and payment —
-- so a job that was sold and paid but not started had no way to say so.
--
-- NOT YET APPLIED to project dpkdsmvskryettdxcvpp (no DB access in the session
-- that wrote it). Apply before the new Active Jobs UI is wired up.

create type sale_status    as enum ('quoted', 'sold');
create type work_status    as enum ('not_started', 'in_progress', 'completed');
create type payment_status as enum ('unpaid', 'paid');

alter table active_jobs
  add column sale_status    sale_status    not null default 'quoted',
  add column work_status    work_status    not null default 'not_started',
  add column payment_status payment_status not null default 'unpaid',
  -- Price is captured at creation now, not deferred to the detail pop-up
  add column price numeric(12, 2);

-- ── Data migration: map every existing row onto the new dimensions ──────────
-- The old enum was a single pipeline: quoted → sold → in_progress → paid.
-- Each old value implies a position on all three axes:
--
--   quoted      → not yet sold, no work, unpaid
--   sold        → sold, work not started, unpaid
--   in_progress → sold (you can't be working an unsold job), working, unpaid
--   paid        → sold, work finished, paid
--
-- 'paid' is the lossy one: the old enum couldn't express "paid but still
-- working", so we take the pipeline at face value and call the work completed.
-- Anything that was actually still in progress can be corrected inline in the UI.
update active_jobs set
  sale_status = case status
    when 'quoted' then 'quoted'
    else 'sold'
  end::sale_status,
  work_status = case status
    when 'quoted' then 'not_started'
    when 'sold'   then 'not_started'
    when 'in_progress' then 'in_progress'
    when 'paid'   then 'completed'
  end::work_status,
  payment_status = case status
    when 'paid' then 'paid'
    else 'unpaid'
  end::payment_status;

-- Keep the old column for one release as a safety net; drop it once the new UI
-- has been running cleanly. (Deliberately NOT dropped in the same migration
-- that backfills — a bad backfill would otherwise be unrecoverable.)
comment on column active_jobs.status is
  'DEPRECATED — superseded by sale_status/work_status/payment_status. Retained for rollback; drop after verifying the new UI.';

-- BUILD_PLAN: the carry-forward safety net is checked by default on new tasks.
alter table tasks alter column auto_carry_forward set default true;
