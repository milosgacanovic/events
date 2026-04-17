-- Composite indexes to speed up filtered + time-ordered activity log queries.
-- The existing idx_activity_log_created_at handles unfiltered listings; these two
-- cover the most common admin filters (action type, actor) where the planner would
-- otherwise filter after the sort.

CREATE INDEX IF NOT EXISTS idx_activity_log_created_action
  ON activity_log (created_at DESC, action);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_actor
  ON activity_log (created_at DESC, actor_id);
