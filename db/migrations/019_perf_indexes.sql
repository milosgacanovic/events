create index if not exists events_status_idx on events(status);
create index if not exists organizers_status_name_idx on organizers(status, name);
