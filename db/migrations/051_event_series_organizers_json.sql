-- Denormalize organizer display fields into the series row.
--
-- Avoids a per-search 3-table join (events → event_organizers → organizers →
-- organizer_roles) by storing the listing-card-shaped organizer array directly
-- on the series row. The json_agg is built at refresh time from published
-- organizers linked to any published sibling, ordered by the canonical
-- event's event_organizers.display_order then by name.
--
-- Shape per element: {id, slug, name, avatarUrl, roles}. Existing
-- `organizer_ids uuid[]` stays around — Meili still uses it for the
-- organizer_ids facet filter, and it carries the union-across-siblings
-- semantics that the DB facet/filter paths rely on.
alter table event_series
  add column if not exists organizers_json jsonb not null default '[]'::jsonb;
