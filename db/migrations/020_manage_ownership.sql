-- host_users: links users to hosts they can manage
CREATE TABLE host_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  UNIQUE(user_id, organizer_id)
);
CREATE INDEX idx_host_users_user ON host_users(user_id);
CREATE INDEX idx_host_users_organizer ON host_users(organizer_id);

-- event_users: explicit user-to-event access grants
CREATE TABLE event_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  UNIQUE(user_id, event_id)
);
CREATE INDEX idx_event_users_user ON event_users(user_id);
CREATE INDEX idx_event_users_event ON event_users(event_id);

-- Import detachment tracking on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS detached_from_import BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS detached_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS detached_by_user_id UUID;
CREATE INDEX idx_events_detached ON events(detached_from_import) WHERE detached_from_import = TRUE;

-- Creator tracking on organizers (events already has created_by_user_id)
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
