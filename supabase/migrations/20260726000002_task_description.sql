-- Tasks get an optional free-text description (BUILD_PLAN Phase 1 tasks table).
-- Shown inline in Active Tasks, and behind a chevron in Today's Schedule.
alter table tasks add column description text;
