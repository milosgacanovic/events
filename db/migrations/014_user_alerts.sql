create table if not exists user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  organizer_id uuid not null references organizers(id) on delete cascade,
  radius_km integer not null default 50 check (radius_km > 0 and radius_km <= 500),
  city text null,
  country_code text null,
  created_at timestamptz not null default now()
);

create unique index if not exists user_alerts_dedupe_idx
  on user_alerts (user_id, organizer_id, coalesce(city, ''), coalesce(country_code, ''), radius_km);

create index if not exists user_alerts_user_id_idx
  on user_alerts (user_id);

create index if not exists user_alerts_organizer_id_idx
  on user_alerts (organizer_id);
