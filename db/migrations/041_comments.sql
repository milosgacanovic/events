-- Event comments
CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) <= 500),
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_event ON comments (event_id, status, created_at);
CREATE INDEX idx_comments_user  ON comments (user_id);
