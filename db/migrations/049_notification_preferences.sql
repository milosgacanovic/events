-- User-level email notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  digest_frequency text NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly')),
  pause_until   date,
  notify_followed_hosts boolean NOT NULL DEFAULT true,
  notify_saved_reminders boolean NOT NULL DEFAULT true,
  notify_rsvp_reminders boolean NOT NULL DEFAULT true,
  notify_event_updates boolean NOT NULL DEFAULT true,
  notify_search_alerts boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
