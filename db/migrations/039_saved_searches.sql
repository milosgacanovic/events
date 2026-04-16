-- Saved search alerts ("Notify Me")
CREATE TABLE saved_searches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label            text,
  filter_snapshot  jsonb NOT NULL,
  frequency        text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
  notify_new       boolean NOT NULL DEFAULT true,
  notify_reminders boolean NOT NULL DEFAULT true,
  notify_updates   boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  unsubscribed_at  timestamptz,
  last_notified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user ON saved_searches (user_id);
