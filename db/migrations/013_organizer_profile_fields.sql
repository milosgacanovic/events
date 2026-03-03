alter table organizers
  add column if not exists image_url text,
  add column if not exists external_url text,
  add column if not exists city text,
  add column if not exists country_code text;

update organizers
set image_url = avatar_path
where image_url is null
  and avatar_path is not null;

with latest_location as (
  select distinct on (ol.organizer_id)
    ol.organizer_id,
    ol.city,
    ol.country_code
  from organizer_locations ol
  order by ol.organizer_id, ol.created_at desc
)
update organizers o
set city = coalesce(o.city, ll.city),
    country_code = coalesce(o.country_code, ll.country_code)
from latest_location ll
where ll.organizer_id = o.id;
