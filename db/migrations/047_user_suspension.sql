-- Allow admins to suspend user accounts. A non-null value means the account
-- is suspended; NULL means active. Suspending hides the user's published
-- comments and pauses their alerts without deleting data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
