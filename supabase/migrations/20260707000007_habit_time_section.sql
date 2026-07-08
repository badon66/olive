-- Habits can be scheduled into a part of the day (drag habit → Today's Schedule
-- section). Null = unscheduled, lives only in the Habits panel.
alter table habits add column time_section time_section;
