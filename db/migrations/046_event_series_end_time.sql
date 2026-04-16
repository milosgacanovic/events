-- Add the end time for the earliest upcoming occurrence so listing cards can
-- show the correct time range (e.g. "18:00–20:00" instead of "18:00–18:00").
alter table event_series
  add column if not exists earliest_upcoming_end_ts timestamptz;
