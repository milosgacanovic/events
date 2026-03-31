ALTER TABLE users ADD COLUMN IF NOT EXISTS is_service_account BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark the importer service account
UPDATE users SET is_service_account = true WHERE display_name LIKE 'service-account-%';
