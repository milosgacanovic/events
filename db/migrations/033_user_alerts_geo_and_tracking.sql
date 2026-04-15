-- Make Follow/Notify alerts actually honour the radius field by storing a geographic
-- center point (lat/lng) + human label. Matching uses PostGIS ST_DWithin, replacing the
-- previous string-only city/country_code filter (which is kept nullable for a transitional
-- period — legacy rows still work as "anywhere" alerts).
alter table user_alerts
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6),
  add column if not exists location_label text,
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at timestamptz;

-- Raise radius ceiling so the 1000 km option is valid; keep non-destructive lower bound.
alter table user_alerts drop constraint if exists user_alerts_radius_km_check;
alter table user_alerts
  add constraint user_alerts_radius_km_check
  check (radius_km > 0 and radius_km <= 5000);

create unique index if not exists user_alerts_unsubscribe_token_idx
  on user_alerts (unsubscribe_token);

-- Track which alert already notified about which occurrence so we never send a duplicate,
-- even across worker restarts. Grouped per (alert_id, occurrence_id).
create table if not exists user_alert_sends (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references user_alerts(id) on delete cascade,
  occurrence_id uuid not null references event_occurrences(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (alert_id, occurrence_id)
);

create index if not exists user_alert_sends_alert_id_idx on user_alert_sends (alert_id);
create index if not exists user_alert_sends_occurrence_id_idx on user_alert_sends (occurrence_id);
