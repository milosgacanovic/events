-- Phase 3: series_id column for grouping imported recurring events.
--
-- Imported sources (e.g. ics_scrape, hand-entered text like "Every Tuesday 7pm
-- until August") produce N separate DR events, one per occurrence detected.
-- Native DR recurring events use a single row + rrule, so they already group
-- naturally. To collapse imported siblings in search/map results, we give
-- every event a series_id:
--   - native events: series_id = events.id (self-grouped, one row anyway)
--   - imported siblings: share a stable UUID v5 supplied by the importer
--
-- The column is mandatory (NOT NULL) to keep downstream queries simple.
-- Default = gen_random_uuid() is a safety net; the application always writes
-- an explicit value (either the caller-supplied seriesId or the freshly
-- minted event id).
--
-- event_occurrences carries a denormalized copy so Meilisearch and map SQL
-- can filter / distinct without a join. A BEFORE INSERT trigger keeps the
-- denormalized value in sync with the parent event automatically — this
-- covers every insert path without forcing each SQL writer to remember it.

-- ----- events.series_id ----------------------------------------------------

alter table events add column series_id uuid;

update events set series_id = id where series_id is null;

alter table events alter column series_id set not null;
alter table events alter column series_id set default gen_random_uuid();

create index if not exists idx_events_series_id on events(series_id);

-- ----- event_occurrences.series_id ----------------------------------------

alter table event_occurrences add column series_id uuid;

update event_occurrences eo
set series_id = e.series_id
from events e
where eo.event_id = e.id
  and eo.series_id is null;

alter table event_occurrences alter column series_id set not null;

create index if not exists idx_event_occurrences_series_id
  on event_occurrences(series_id);

-- Trigger: every insert into event_occurrences auto-fills series_id from the
-- parent event, unless the caller already provided one. Keeps existing insert
-- SQL (3 distinct code paths in replaceOccurrencesInWindow) unchanged.

create or replace function event_occurrences_set_series_id()
returns trigger
language plpgsql
as $$
begin
  if new.series_id is null then
    select series_id into new.series_id from events where id = new.event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_occurrences_set_series_id on event_occurrences;
create trigger trg_event_occurrences_set_series_id
  before insert on event_occurrences
  for each row
  execute function event_occurrences_set_series_id();
