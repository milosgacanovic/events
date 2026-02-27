alter table events
  add column if not exists is_imported boolean not null default false;

alter table events
  add column if not exists import_source text null;
