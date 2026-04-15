-- Series-level index table.
--
-- One row per distinct series_id, denormalized from events + event_occurrences.
-- Source of truth for the new Meili `series` index that powers /events/search.
-- Each series row mirrors the "canonical sibling" (the published sibling whose
-- earliest upcoming occurrence is soonest) and unions tags/languages/organizers
-- across siblings so facet lookups find the series under any sibling's value.
--
-- `upcoming_dates` is a UTC date[] bucket array. The search route expands a
-- user-provided date range (from/to preset) into a list of YYYY-MM-DD strings
-- and filters the series index with an OR over those buckets. This gives
-- exact-distinct totals and facet counts without any SQL distinct math.
--
-- This migration only creates the table and indexes. Population happens via
-- the `backfillEventSeries.ts` script and ongoing lifecycle hooks.

create table if not exists event_series (
  series_id uuid primary key,
  canonical_event_id uuid not null references events(id) on delete cascade,

  -- canonical sibling mirror
  title text not null,
  slug text not null,
  cover_image_path text,
  description_json jsonb,
  practice_category_id uuid,
  practice_subcategory_id uuid,
  event_format_id uuid,
  attendance_mode text not null,
  schedule_kind text not null,
  event_timezone text not null,
  country_code text,
  city text,
  geom geography(Point, 4326),

  -- unions across siblings
  tags text[] not null default '{}',
  languages text[] not null default '{}',
  organizer_ids uuid[] not null default '{}',

  -- series-level aggregates
  upcoming_dates date[] not null default '{}',
  earliest_upcoming_ts timestamptz,
  upcoming_count int not null default 0,
  sibling_count int not null default 1,
  has_geo boolean not null default false,
  visibility text not null default 'public',

  refreshed_at timestamptz not null default now()
);

create index if not exists idx_event_series_earliest on event_series (earliest_upcoming_ts);
create index if not exists idx_event_series_dates on event_series using gin (upcoming_dates);
create index if not exists idx_event_series_tags on event_series using gin (tags);
create index if not exists idx_event_series_languages on event_series using gin (languages);
create index if not exists idx_event_series_organizers on event_series using gin (organizer_ids);
create index if not exists idx_event_series_geom on event_series using gist (geom);
create index if not exists idx_event_series_practice on event_series (practice_category_id);
create index if not exists idx_event_series_country on event_series (country_code);
