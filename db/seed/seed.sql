insert into organizer_roles (key, label, sort_order)
values
  ('teacher', 'Teacher', 1),
  ('dj', 'DJ', 2),
  ('organizer', 'Organizer', 3),
  ('host', 'Host', 4)
on conflict (key) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

insert into practices (id, parent_id, level, key, label, sort_order)
values
  (gen_random_uuid(), null, 1, 'ecstatic-dance', 'Ecstatic Dance', 1),
  (gen_random_uuid(), null, 1, 'five-rhythms', '5Rhythms', 2),
  (gen_random_uuid(), null, 1, 'contact-improv', 'Contact Improvisation', 3)
on conflict (key) do nothing;

with categories as (
  select id, key
  from practices
  where level = 1
)
insert into practices (parent_id, level, key, label, sort_order)
select c.id, 2, 'ecstatic-dance-open-floor', 'Open Floor', 1
from categories c
where c.key = 'ecstatic-dance'
on conflict (key) do nothing;

with categories as (
  select id, key
  from practices
  where level = 1
)
insert into practices (parent_id, level, key, label, sort_order)
select c.id, 2, 'five-rhythms-waves', 'Waves Class', 1
from categories c
where c.key = 'five-rhythms'
on conflict (key) do nothing;
