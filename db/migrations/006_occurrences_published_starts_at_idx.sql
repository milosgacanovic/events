create index if not exists event_occurrences_published_starts_at_event_idx
  on event_occurrences (starts_at_utc, event_id)
  where status = 'published';
