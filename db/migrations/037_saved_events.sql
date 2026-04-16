-- Saved events (bookmarks). Users can save a whole event ("all sessions" for
-- recurring) or a single occurrence date.
CREATE TABLE saved_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_id uuid REFERENCES event_occurrences(id) ON DELETE SET NULL,
  scope         text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'single')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A user can save the same event once per scope (all vs specific occurrence).
CREATE UNIQUE INDEX idx_saved_events_unique
  ON saved_events (user_id, event_id, COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX idx_saved_events_user  ON saved_events (user_id);
CREATE INDEX idx_saved_events_event ON saved_events (event_id);
