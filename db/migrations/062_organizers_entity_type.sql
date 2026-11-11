-- SEO round 3, Task 6: hosts were all marked up as schema.org Organization,
-- including individual teachers. Store what a host is; the host page emits
-- Person or Organization JSON-LD from it. Default is person (most hosts are
-- teachers); organizations are set by an editor, never auto-classified.
alter table organizers add column if not exists entity_type text not null default 'person';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizers_entity_type_check'
  ) then
    alter table organizers
      add constraint organizers_entity_type_check
      check (entity_type in ('person', 'organization'));
  end if;
end $$;
