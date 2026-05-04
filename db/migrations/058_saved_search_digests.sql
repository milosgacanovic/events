-- Saved-search digest infra.
--
-- saved_search_sends: per-(search, event) dedup. Mirrors user_alert_sends
-- from migration 033. Worker INSERTs on send; ON CONFLICT DO NOTHING keeps
-- retries idempotent. ON DELETE CASCADE so dropping a search or event also
-- cleans the dedup history.
CREATE TABLE IF NOT EXISTS saved_search_sends (
  search_id  uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (search_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_search_sends_search ON saved_search_sends (search_id);
CREATE INDEX IF NOT EXISTS idx_saved_search_sends_sent_at ON saved_search_sends (sent_at);

-- last_evaluated_at: throttle column, separate from last_notified_at. Worker
-- moves it forward on every check (including empty-digest runs); UI continues
-- to show last_notified_at as "Last sent". Without this split, an active
-- search with zero matches would be re-queried every cron tick.
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz;

-- Partial index keeps the worker's "find due rows" scan cheap as the table
-- grows. Excludes unsubscribed rows since the worker filters them out anyway.
CREATE INDEX IF NOT EXISTS idx_saved_searches_due
  ON saved_searches (last_evaluated_at)
  WHERE unsubscribed_at IS NULL;
