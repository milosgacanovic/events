-- Import detachment tracking on organizers (mirrors migration 020 for events).
-- When an editor/teacher edits an imported host, the API flips detached_from_import=true
-- so subsequent importer runs via /admin/organizers/upsert-external skip the row
-- instead of overwriting the human edits.
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS detached_from_import BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS detached_at TIMESTAMPTZ;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS detached_by_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_organizers_detached ON organizers(detached_from_import) WHERE detached_from_import = TRUE;
