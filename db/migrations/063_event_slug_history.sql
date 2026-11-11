-- SEO round 3, Task 7: remember every slug an event had, so a future slug
-- change can permanently redirect old URLs (GET /api/events/:slug/redirect).
create table if not exists event_slug_history (
  old_slug   text primary key,
  event_id   uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists event_slug_history_event_id_idx on event_slug_history (event_id);

create or replace function record_event_slug_change() returns trigger
language plpgsql as $$
begin
  if new.slug is distinct from old.slug then
    insert into event_slug_history (old_slug, event_id)
    values (old.slug, old.id)
    on conflict (old_slug) do update set event_id = excluded.event_id, created_at = now();
    -- A slug that is live again must not redirect away from itself.
    delete from event_slug_history where old_slug = new.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists events_record_slug_change on events;
create trigger events_record_slug_change
  after update of slug on events
  for each row execute function record_event_slug_change();
