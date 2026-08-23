-- Flexible-window tasks + the `skipped` weekly check-in status.

-- 1. A task can float across several candidate days instead of being pinned to
--    one due_date. Two mutually exclusive ways to express the options:
--      • a continuous range: window_start .. window_end
--      • hand-picked days:   candidate_dates[]
--    `placed_date` is where the scheduler currently has it. due_date stays the
--    authoritative "when is this actually happening" column so every existing
--    query keeps working — placement writes through to it.
alter table tasks
  add column window_start date,
  add column window_end date,
  add column candidate_dates date[],
  add column placed_date date;

-- Exactly one flexibility mode, never both.
alter table tasks add constraint tasks_one_window_mode check (
  not (
    (window_start is not null or window_end is not null)
    and (candidate_dates is not null and array_length(candidate_dates, 1) > 0)
  )
);

-- A range needs both ends, ordered.
alter table tasks add constraint tasks_window_range_sane check (
  (window_start is null and window_end is null)
  or (window_start is not null and window_end is not null and window_start <= window_end)
);

create index tasks_flexible_idx on tasks (user_id, status)
  where window_start is not null or candidate_dates is not null;

-- 2. "Skip today" on a weekly occurrence: explicitly not-doing-it today, which
--    is NOT the same as missing it. A skipped day must not count against the
--    weekly target and must not alter the recurring pattern.
alter type checkin_status add value if not exists 'skipped';
