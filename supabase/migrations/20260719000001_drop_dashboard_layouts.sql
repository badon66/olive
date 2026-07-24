-- Customize drag/resize was removed per BUILD_PLAN (fixed dashboard layout).
-- The table only ever stored section positions/widths/labels for that feature,
-- so it goes with it rather than lingering as dead schema.
drop table if exists dashboard_layouts;
