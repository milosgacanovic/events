-- Precomputed date-preset buckets on the series row.
--
-- Collapses the 7-preset fan-out (today, tomorrow, this_weekend, this_week,
-- next_week, this_month, next_month) into a single Meili facet request on
-- the main search query. Each series carries the set of buckets any of its
-- upcoming_dates falls into, computed in UTC.
--
-- Drift: UTC-based boundaries shift relative to the viewer's local day by up
-- to a few hours, but this value is only used to render the *count* next to
-- each preset chip — the actual filter-when-clicked path still expands the
-- preset into tz-aware `upcoming_dates = ...` clauses for exact results.
-- A lightweight hourly cron keeps the values fresh.
alter table event_series
  add column if not exists event_date_buckets text[] not null default '{}';
