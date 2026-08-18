-- BUILD_PLAN: the carry-forward checkbox is "checked by default" and the column
-- is specified as `auto_carry_forward boolean default true`. The column was
-- actually created with default FALSE back in 20260727000001 and never
-- corrected, so anything inserted without an explicit value silently opted OUT
-- of the carryover safety net. Found in the dead-code/perf audit.
alter table tasks alter column auto_carry_forward set default true;
