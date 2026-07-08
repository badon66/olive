-- Phase 1 follow-up: fixed-time bookings + flexible time-of-day sections.
-- scheduled_time = a real appointment time (booking); time_section = which part
-- of the day a flexible task belongs to. Distinct concepts per BUILD_PLAN.
create type time_section as enum ('morning', 'midday', 'afternoon', 'evening', 'anytime');

alter table tasks
  add column scheduled_time time,
  add column time_section time_section;
