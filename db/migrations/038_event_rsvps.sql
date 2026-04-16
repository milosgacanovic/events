-- RSVP / "I'm Going" tracking
CREATE TABLE event_rsvps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_id uuid REFERENCES event_occurrences(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One RSVP per user per event+occurrence combo
CREATE UNIQUE INDEX idx_rsvps_unique
  ON event_rsvps (user_id, event_id, COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX idx_rsvps_event ON event_rsvps (event_id);
CREATE INDEX idx_rsvps_user  ON event_rsvps (user_id);
