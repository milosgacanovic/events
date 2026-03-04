alter table organizer_locations
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists provider text,
  add column if not exists place_id text;

create unique index if not exists organizer_locations_single_primary_idx
on organizer_locations (organizer_id)
where is_primary = true;

create unique index if not exists organizer_locations_external_ref_unique_idx
on organizer_locations (organizer_id, external_source, external_id)
where external_id is not null;

create index if not exists organizer_locations_organizer_primary_created_idx
on organizer_locations (organizer_id, is_primary desc, created_at desc);

create index if not exists organizer_locations_city_idx
on organizer_locations (lower(city))
where city is not null;

create index if not exists organizer_locations_country_code_idx
on organizer_locations (lower(country_code))
where country_code is not null;
