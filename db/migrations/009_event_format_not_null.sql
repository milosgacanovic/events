alter table events
  alter column event_format_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_event_format'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint fk_event_format
      foreign key (event_format_id)
      references event_formats(id)
      on delete restrict;
  end if;
end $$;

alter table events
  alter column is_imported set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'check_import_source_consistency'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint check_import_source_consistency
      check (
        (is_imported = true and import_source is not null)
        or
        (is_imported = false)
      );
  end if;
end $$;
