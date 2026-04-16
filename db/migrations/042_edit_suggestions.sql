-- Edit suggestions from users
CREATE TABLE edit_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event', 'organizer')),
  target_id   uuid NOT NULL,
  category    text NOT NULL,
  body        text NOT NULL CHECK (char_length(body) <= 1000),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'actioned', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggestions_target ON edit_suggestions (target_type, target_id);
