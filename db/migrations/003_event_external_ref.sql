alter table events
  add column if not exists external_source text,
  add column if not exists external_id text;

create unique index if not exists events_external_source_external_id_unique_idx
  on events (external_source, external_id)
  where external_source is not null and external_id is not null;

create index if not exists events_external_source_idx on events (external_source);
create index if not exists events_external_id_idx on events (external_id);
