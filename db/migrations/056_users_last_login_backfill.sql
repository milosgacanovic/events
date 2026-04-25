-- Backfill last_login_at for existing users using their most recent event
-- update as a proxy for activity; fall back to account creation date.
update users u
set last_login_at = coalesce(
  (select max(e.updated_at) from events e where e.created_by_user_id = u.id),
  u.created_at
)
where u.last_login_at is null;
