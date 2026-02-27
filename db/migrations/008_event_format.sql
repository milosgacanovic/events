create table if not exists event_formats (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

alter table events
  add column if not exists event_format_id uuid null references event_formats(id);

create index if not exists idx_events_event_format_id on events(event_format_id);

insert into event_formats (key, label, sort_order, is_active)
values
  ('single_session', 'Single Session', 1, true),
  ('recurring_class', 'Recurring Class', 2, true),
  ('workshop', 'Workshop', 3, true),
  ('weekend_retreat', 'Weekend Retreat', 4, true),
  ('intensive', 'Intensive', 5, true),
  ('festival', 'Festival', 6, true)
on conflict (key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true;
