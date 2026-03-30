-- GIN index on events.tags for fast && (overlap) filtering
CREATE INDEX IF NOT EXISTS events_tags_gin_idx ON events USING gin (tags);
