-- Fix status CHECK constraint: 'more_info' → 'more_info_requested'
-- Make description and proof_url NOT NULL with defaults

-- Update existing rows first to avoid constraint violations
UPDATE editor_applications SET description = '' WHERE description IS NULL;
UPDATE editor_applications SET proof_url = '' WHERE proof_url IS NULL;
UPDATE editor_applications SET status = 'more_info_requested' WHERE status = 'more_info';

-- Drop the old CHECK and add the corrected one
ALTER TABLE editor_applications DROP CONSTRAINT IF EXISTS editor_applications_status_check;
ALTER TABLE editor_applications ADD CONSTRAINT editor_applications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'more_info_requested'));

-- Apply NOT NULL + defaults
ALTER TABLE editor_applications ALTER COLUMN description SET NOT NULL;
ALTER TABLE editor_applications ALTER COLUMN description SET DEFAULT '';
ALTER TABLE editor_applications ALTER COLUMN proof_url SET NOT NULL;
ALTER TABLE editor_applications ALTER COLUMN proof_url SET DEFAULT '';
