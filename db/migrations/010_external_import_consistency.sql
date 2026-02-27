do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'check_external_import_consistency'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint check_external_import_consistency
      check (
        external_id is null
        or
        is_imported = true
      );
  end if;
end $$;
