-- "Recently added" sort on the events list page needs a per-series
-- "when was anything in this series last added?" signal. We take the
-- maximum created_at across all siblings of a series and expose it as
-- an epoch-ms integer so Meili can sort on it numerically (matching
-- the pattern we already use for earliest_upcoming_ts).
alter table event_series
  add column if not exists latest_created_ts bigint;
