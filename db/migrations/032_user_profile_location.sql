-- Save a user's home location on the profile so it can pre-fill the Follow/Notify form
-- and power future "events near me" personalization. All fields nullable — users opt in.
alter table users
  add column if not exists home_country_code text,
  add column if not exists home_city text,
  add column if not exists home_lat numeric(9, 6),
  add column if not exists home_lng numeric(9, 6),
  add column if not exists home_location_label text,
  add column if not exists default_radius_km integer;

alter table users
  add constraint users_default_radius_km_check
  check (default_radius_km is null or (default_radius_km > 0 and default_radius_km <= 5000));
