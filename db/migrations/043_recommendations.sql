-- Recommend to a friend
CREATE TABLE recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  note            text CHECK (char_length(note) <= 500),
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommendations_sender ON recommendations (sender_user_id, sent_at);
