create extension if not exists pgcrypto;
create extension if not exists postgis;

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  keycloak_sub text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists organizers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description_json jsonb not null default '{}'::jsonb,
  website_url text,
  tags text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'published' check (status in ('published', 'draft', 'archived'))
);

create table if not exists organizer_roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists organizer_locations (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers(id) on delete cascade,
  label text,
  formatted_address text,
  country_code text,
  city text,
  geom geography(point, 4326),
  created_at timestamptz not null default now()
);
create index if not exists organizer_locations_geom_gist_idx on organizer_locations using gist (geom);

create table if not exists practices (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references practices(id) on delete cascade,
  level int not null check (level in (1, 2)),
  key text unique not null,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  constraint practices_level_parent_check check (
    (level = 1 and parent_id is null) or
    (level = 2 and parent_id is not null)
  )
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description_json jsonb not null default '{}'::jsonb,
  cover_image_path text,
  external_url text,
  attendance_mode text not null check (attendance_mode in ('in_person', 'online', 'hybrid')),
  online_url text,
  practice_category_id uuid not null references practices(id),
  practice_subcategory_id uuid references practices(id),
  tags text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  schedule_kind text not null check (schedule_kind in ('single', 'recurring')),
  event_timezone text not null,
  single_start_at timestamptz,
  single_end_at timestamptz,
  rrule text,
  rrule_dtstart_local timestamptz,
  duration_minutes int,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'archived')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint events_schedule_shape_check check (
    (
      schedule_kind = 'single' and
      single_start_at is not null and
      single_end_at is not null and
      rrule is null and
      rrule_dtstart_local is null and
      duration_minutes is null
    )
    or
    (
      schedule_kind = 'recurring' and
      single_start_at is null and
      single_end_at is null and
      rrule is not null and
      rrule_dtstart_local is not null and
      duration_minutes is not null
    )
  )
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  label text,
  formatted_address text not null,
  country_code text,
  city text,
  geom geography(point, 4326) not null,
  created_at timestamptz not null default now()
);
create index if not exists locations_geom_gist_idx on locations using gist (geom);

create table if not exists event_locations (
  event_id uuid primary key references events(id) on delete cascade,
  location_id uuid not null references locations(id)
);

create table if not exists event_organizers (
  event_id uuid not null references events(id) on delete cascade,
  organizer_id uuid not null references organizers(id) on delete cascade,
  role_id uuid not null references organizer_roles(id),
  display_order int not null default 0,
  primary key (event_id, organizer_id, role_id)
);

create table if not exists event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  status text not null default 'published' check (status in ('published', 'cancelled')),
  location_id uuid references locations(id),
  country_code text,
  city text,
  geom geography(point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_occurrences_starts_at_idx on event_occurrences (starts_at_utc);
create index if not exists event_occurrences_ends_at_idx on event_occurrences (ends_at_utc);
create index if not exists event_occurrences_event_id_idx on event_occurrences (event_id);
create index if not exists event_occurrences_geom_gist_idx on event_occurrences using gist (geom);

create table if not exists geocode_cache (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  provider text not null default 'nominatim',
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, query)
);

create trigger organizers_set_updated_at
before update on organizers
for each row
execute function set_updated_at();

create trigger events_set_updated_at
before update on events
for each row
execute function set_updated_at();

create trigger occurrences_set_updated_at
before update on event_occurrences
for each row
execute function set_updated_at();
