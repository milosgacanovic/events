-- City landing pages /events/in/<country>/<city> (SEO round 3, Proposal B,
-- approved by the owner 2026-11-11).
--
-- cities: one row per city that may get a page. Only owner-approved rows get
-- a page (scripts/seedCities.ts writes a review CSV, then --apply).
-- slug is the English name (exonym policy: /events/in/at/vienna).
-- below_min_since: set by the nightly refresh when the city drops under the
-- minimum (3 distinct upcoming series); the page turns noindex only after
-- 30 days below it, so a weekly gap doesn't flap robots/sitemap.
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[a-z]{2}$'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  approved boolean not null default false,
  below_min_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, slug)
);

-- Spellings that mean the same city: normalized key (lowercase, no
-- diacritics, punctuation → space; see apps/api/src/utils/cityKey.ts) →
-- city slug. Covers case/diacritic variants, exonyms (wien → vienna) and
-- districts merged into a city (brooklyn → new-york-city).
create table if not exists city_aliases (
  country_code text not null,
  alias_key text not null,
  city_slug text not null,
  created_at timestamptz not null default now(),
  primary key (country_code, alias_key),
  foreign key (country_code, city_slug) references cities (country_code, slug)
    on update cascade on delete cascade
);

create index if not exists city_aliases_city_idx on city_aliases (country_code, city_slug);
