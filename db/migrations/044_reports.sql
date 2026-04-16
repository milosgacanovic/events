-- Report a problem
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event', 'organizer')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL,
  detail      text CHECK (char_length(detail) <= 1000),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
