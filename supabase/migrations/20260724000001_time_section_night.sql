-- New "night" part of day (roughly 23:00 → 07:00), alongside
-- morning/midday/afternoon/evening/anytime. With the 7 AM day boundary, night
-- belongs to the day that started the previous morning.
alter type time_section add value if not exists 'night';
