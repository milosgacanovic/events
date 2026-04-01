-- Activity log: audit trail for entity changes
CREATE TABLE IF NOT EXISTS activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name    text,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid,
  target_label  text,
  metadata      jsonb DEFAULT '{}',
  snapshot      jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action);
CREATE INDEX IF NOT EXISTS idx_activity_log_target ON activity_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_search ON activity_log
  USING gin (to_tsvector('simple', coalesce(action, '') || ' ' || coalesce(actor_name, '') || ' ' || coalesce(target_label, '')));

-- Error log: persisted API 500 errors
CREATE TABLE IF NOT EXISTS error_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message  text NOT NULL,
  stack_trace    text,
  request_method text,
  request_url    text,
  request_body   jsonb,
  actor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name     text,
  status_code    int,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log (created_at DESC);
