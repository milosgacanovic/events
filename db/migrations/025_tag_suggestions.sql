CREATE TABLE IF NOT EXISTS tag_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  reason TEXT,
  suggested_by_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_status ON tag_suggestions(status);
