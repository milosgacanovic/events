-- Moderation queue for comments, suggestions, and reports
CREATE TABLE moderation_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type      text NOT NULL CHECK (item_type IN ('comment', 'suggestion', 'report')),
  item_id        uuid NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'actioned')),
  moderator_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  moderator_note text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_modqueue_status ON moderation_queue (status);
CREATE INDEX idx_modqueue_item   ON moderation_queue (item_type, item_id);
