create index if not exists event_organizers_organizer_id_idx
on event_organizers (organizer_id);

create index if not exists event_organizers_role_id_organizer_id_idx
on event_organizers (role_id, organizer_id);

create index if not exists events_status_practice_category_idx
on events (status, practice_category_id);

create index if not exists organizers_status_country_code_idx
on organizers (status, lower(country_code));

create index if not exists organizers_status_city_idx
on organizers (status, lower(city));

create index if not exists organizers_tags_gin_idx
on organizers using gin (tags);

create index if not exists organizers_languages_gin_idx
on organizers using gin (languages);

create index if not exists events_languages_gin_idx
on events using gin (languages);
