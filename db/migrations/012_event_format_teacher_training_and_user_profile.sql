insert into event_formats (key, label, sort_order, is_active)
values ('teacher_training', 'Teacher Training', 7, true)
on conflict (key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true;

alter table users
add column if not exists display_name text,
add column if not exists email text;
