-- Series hub pages /series/<slug> (SEO round 3, Proposal A1, approved by the
-- owner 2026-11-11; no redirects from past occurrences — that is A2).
--
-- The hub URL must not depend on series_id: importers re-key series (the
-- upstream id changes) and a hub keyed on series_id would lose its URL. A
-- slug row can be moved to the re-keyed series; old slugs stay as
-- is_current = false rows and redirect to the series' current slug.
create table if not exists series_slugs (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  series_id uuid not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists series_slugs_one_current_idx on series_slugs (series_id) where is_current;
create index if not exists series_slugs_series_idx on series_slugs (series_id);
