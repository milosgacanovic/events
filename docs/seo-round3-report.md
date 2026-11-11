# SEO round 3 — delivery report

Handoff: `/opt/dr-admin/uploads/inbox/1794314428024_f0d8fc057ce5_handoff.md`.
Work was committed straight to `main` and deployed blue/green, so each "PR" below is a set of
commits rather than a GitHub pull request. The importer work lives in `milosgacanovic/dr-events-importer`.
Audit: `python3 scripts/seo_audit.py --seed N` (now also daily at 04:30 UTC via `scripts/seo-audit-cron.sh`).

| PR | Task | Commits (events) | Commits (importer) | Status |
|---|---|---|---|---|
| 1 | Sitemaps = indexable pages only; JSON-LD offsets; self-canonicals | `2ed6671`, `1524552`, `2eeb7c1` | — | deployed 2026-11-10 |
| 2 | Unique titles + meta descriptions; sibling links | `01bcd41` | — | deployed 2026-11-10 |
| 3 | Text cleaning, importer descriptions, image fallback | `cfc937a` | `b68bbba`, `f3993bf`, `1b82443`, `ed318df` | deployed; backfill applied 2026-11-11 |
| 4 | Host pages: server-rendered event links, Person/Organization | `e2d5f6d`, `0f22f3c` | `5c0cea8` (bio paragraphs) | deployed 2026-11-11 |
| 5 | Slugs for new events, transliteration, slug history | `abbe121` | — | deployed 2026-11-11 |
| — | Proposals A–C design note | `3115a18` (`docs/seo-proposals-round3.md`) | — | approved 2026-11-11: C, B, A1 (not A2) |
| C | Thin-host policy | `be8f14e` | — | deployed 2026-11-11 |
| B + A1 | City pages, series hubs | `c182573`, `ae1302b` | — | code deployed 2026-11-11; data seed awaits owner review |

---

## PR 1 — Tasks 1, 2 (and Task 4's self-canonical)

**Root cause.** The sitemap and the page decided indexability separately, so sitemaps listed pages the page
itself marked `noindex`; JSON-LD dates had no UTC offset; recurring siblings canonicalised to another page.

**Fix.** One predicate, `packages/shared/src/seo/indexability.ts` (`isEventIndexable`), used by the event page and
`GET /api/seo/sitemap/events`. Multi-sibling series index the siblings starting within 60 days plus the series'
earliest upcoming sibling (owner decision). Every live occurrence page is self-canonical; JSON-LD dates carry the
event's zone offset. `offers` intentionally not emitted: there are no price fields (owner decision), and the audit
reports it as INFO.

**Files.** `packages/shared/src/seo/indexability.ts`, `apps/api/src/db/eventRepo.ts`, `apps/api/src/routes/events.ts`,
`apps/web/lib/sitemap.ts`, `apps/web/app/sitemap.xml/route.ts`, `apps/web/app/events/[slug]/page.tsx`,
`apps/web/lib/datetime.ts`, `scripts/seo_audit.py`.

**Evidence (after, 2026-11-11).**
```
pulse-47               index, follow  canonical=/events/pulse-47               startDate=2026-11-26T19:00:00+00:00
source-in-motion-37    index, follow  canonical=/events/source-in-motion-37    startDate=2026-11-11T18:30:00-06:00
emerging-waves-1234    index, follow  canonical=/events/emerging-waves-1234    startDate=2026-11-13T18:30:00+08:00
body-prayers-10        noindex, follow (past) — not in any sitemap
```

## PR 2 — Tasks 3, 4

**Root cause.** Titles were the bare event title, so series and same-named events collided (hundreds of `Sweat Your Prayers` pages, e.g. `sweat-your-prayers-429`).

**Fix.** `apps/web/lib/eventSeo.ts`: `Title with Host · City · Date`, date in the event's zone and locale
(`apps/web/lib/seoDate.ts`), and a visible subtitle carrying the same facts. Meta descriptions are built from real fields only.
Sibling dates are listed as links in the "Upcoming" list. The title limit was raised to 70 because the handoff's own examples run 66–67 characters.

**Evidence (after).**
```
Pulse with Christian de Sousa · Totnes · Thu 26 Nov 2026
Friday evening in Paris center · Paris · Fri 13 Nov 2026
Sweat Your Prayers · Cologne / Koeln · Fri 13 Nov 2026
```

## PR 3 — Task 5

**Root cause.** Several text paths stripped tags differently and double-escaped entities (`&amp;amp;`). Importer
descriptions carried 5Rhythms policy boilerplate (`Registration Policy … No prerequisites required.`), WordPress nav
menus (osho_himalayas), and ecstaticdance.org's redesign (~2026-10-25) made the scraper copy the whole page:
buttons, sidebar, donate footer.

**Fix.**
- Web: one `htmlToPlainText` (decodes entities once, breaks at block boundaries). Thin descriptions get a visible factual summary. Image fallback chain.
- Importer: the `DescriptionCleaner` keeps 5Rhythms registration and refund text as one line each (owner decision) and drops nav menus. The ecstaticdance scraper parses the new "edl" layout.
- Backfill (`scripts/backfill_published_descriptions.php`, dry run shown to the owner first) re-queued 10,263 events on 2026-11-11.

**Dance Church (empty descriptions, `dance-church-omculture-wallingford-42njke`).** The scraper reads each class's
description from its Playwright-cached `/performances/<id>` page. The prefetch only cached the homepage's links, and the
class pages are linked one level deeper, from the city schedules, so 68 of 71 upcoming classes had no description.
Importer `ed318df` adds an optional detail pass to `playwright_fetch.mjs` (`sources.config.playwright_prefetch.detail_*`,
migration 0115): 60 class pages per run, refreshed weekly.

**Not changed: 5Rhythms "CLASS LEVEL DETAILS".** The importer drops this block on purpose (DescriptionCleaner rule S1c).
It is the generic per-level blurb ("In Heartbeat we explore…"), identical on thousands of classes; the class's own text is
kept, and thin results get the factual summary.

**Evidence (after).** `hosts/chiara-pietroboni` meta: `sharing &amp; offering` (single-escaped; it was `&amp;amp;`).
`hosts/jup-jansonius` "mystery.Ilife": caused at import. The source has `mystery.<p>Ilife`, and the bio parser
only broke at closing tags. Fixed in the importer (`5c0cea8`); it reaches DR with the next teacher-profile sync.

## PR 4 — Task 6

**Root cause.** The host page rendered its event list client-side only (the initial HTML had no `/events/` links),
and every host was `Organization` JSON-LD.

**Fix.**
- The server fetches the first page of upcoming events (same query as the client) and seeds the cards.
- `GET /api/organizers/:slug` returns `upcomingEvents`: every *indexable* upcoming event page of the host, using the sitemap's predicate and inputs. The page lists the ones not shown as cards as compact rows ("More upcoming dates", 35 locales), dated in each event's zone.
- `organizers.entity_type` (`person` default | `organization`, migration 062), editable in the host form (35 locales). JSON-LD `@type` follows it.
- `url`, absolute `image`, `sameAs` (website and profile), and `description` only from the host's own bio.

**Files.** `db/migrations/062_organizers_entity_type.sql`, `apps/api/src/db/organizerRepo.ts`, `apps/api/src/db/adminRepo.ts`,
`apps/api/src/routes/organizers.ts`, `packages/shared/src/schemas/organizer.ts`, `apps/web/app/hosts/[slug]/page.tsx`,
`apps/web/components/OrganizerDetailClient.tsx`, `apps/web/components/manage/HostForm.tsx`, `apps/web/lib/hostEvents.ts`, i18n.

**Evidence.** Before: 0 event links in the initial HTML (audit 1/5). After:
```
christian-de-sousa  event links in HTML: 9   "@type":"Person"
jup-jansonius       event links in HTML: 54  (10 cards + 44 rows) "@type":"Person"
jan-redsted         event links in HTML: 4   "@type":"Person"
chiara-pietroboni   event links in HTML: 1   "@type":"Person"
```
**Owner review.** `temporary/host-type-review.csv` listed 61 hosts whose name or role looks like an organization.
Nothing was auto-classified. The owner edited and approved it, and it was applied on 2026-11-11: 52 organization, 9 person
(e.g. `biodanza-au`, `good-medicine-collective` → `Organization`; `chris-camp` stays `Person`).

## PR 5 — Task 7

**Root cause.** `slugify(title)` + `-2…-10` + random suffix. Non-Latin titles slugified to nothing → `item-NNN`;
placeholders → `tbd`; entities → `-andamp-`.

**Fix (new events only; existing URLs unchanged).**
- `apps/api/src/utils/eventSlug.ts`: title + city, then + first organizer's surname, then a numeric suffix as the last resort.
- Titles are transliterated with `any-ascii`. Placeholder or unusable titles fall back to city + organizer. Route words (`in`, `series`, …) are reserved.
- `event_slug_history` + trigger (migration 063) records every slug change. `GET /api/events/:slug/redirect` resolves an old slug, and the event page answers with a permanent redirect (308).
- Unit tests cover a generic collision, Hebrew, Serbian Cyrillic, Arabic, TBD, entities, length and reserved words (11 cases).

**Examples.** `Emerging Waves`/Den Haag/Ana Freitas → `emerging-waves-den-haag`, then `emerging-waves-den-haag-freitas`;
`ריקוד אקסטטי`/Tel Aviv → `rykvd-kstty-tel-aviv`; `Плес у Београду` → `ples-u-beogradu-beograd`; `TBD` → `den-haag-ana-freitas`.

---

## Proposals approved 2026-11-11 (C → B → A1; A2 not approved)

**C — thin hosts (deployed).** `isHostIndexable()` (`packages/shared/src/seo/hostIndexability.ts`) drives both the host
page's robots (`GET /organizers/:slug` → `seo.indexable`) and the new `GET /seo/sitemap/hosts`. A published host with no
upcoming event, no event started in the past 12 months (cancelled events don't count) and a visible bio under 300
characters is `noindex, follow`; the page stays 200. Live: 1,195 of 1,757 hosts in the sitemap;
`hosts/abiola-abrams` → `noindex, follow`, `hosts/jup-jansonius` → `index, follow`.

**B — city pages `/events/in/<country>/<city>` (code deployed, data pending).** Tables `cities` + `city_aliases` (064).
Raw cities are folded (case, diacritics, punctuation) and mapped through aliases (English exonyms: `wien` → `vienna`;
`brooklyn` → `new-york-city`). Occurrences > 100 km from the city's median point are dropped (Portland ME vs OR).
Server-rendered list (one row per series: next date, cadence, hosts, venue, practice, hub link) and hosts; self-canonical,
no Event markup; `sitemap-cities.xml`. Indexed until 30 days below 3 series. Event pages link the city name to it.
Dry run (production, read-only): 688 raw pairs → 666 cities; 87 with ≥ 5 series; **71 suggested** (≥ 2 hosts, looks like
a city). Review file: `temporary/city-review.csv`; apply with `seedCities.ts --apply --csv=…`.

**A1 — series hubs `/series/<slug>` (code deployed, data pending).** Table `series_slugs` (065). Hubs for multi-sibling
series with ≥ 2 upcoming dates; every date as a link, hosts, cadence, city link; no Event markup; old slugs 308 to the
current one; `sitemap-series.xml`. "All dates" on occurrence pages, "See upcoming dates" on past dates, "Regular classes"
on host pages. Dry run: **535 hubs**, 7 need a numeric suffix. Plan: `temporary/series-hub-plan.csv`; apply with
`backfillSeriesSlugs.ts --apply`. Afterwards the nightly occurrences refresh keeps both up to date.

Tested end to end on a scratch copy of the database (seed + backfill applied there, pages rendered, 308 for an old hub
slug, RTL and mobile checked) before the code was deployed.

## Incident 2026-11-11 17:52–17:55 UTC (site down ~3 min)
- **Cause:** the scratch database for the B/A1 tests, plus two deploy image builds, filled the data volume (`/dev/sda`,
  shared by Docker, containerd, `/opt` and MySQL). Free space had been checked on the root filesystem by mistake. Dropping
  the scratch database forced a checkpoint, Postgres PANICked ("No space left on device") and ran crash recovery; the
  Keycloak database did the same. The events API exited on unhandled pool errors and had no restart policy.
- **Recovery:** pruned Docker build cache (4.2 GB), removed an unused `php:8.2-cli` image and local `.next` build output;
  Postgres and Keycloak recovered on their own; the API was restarted. No data loss (WAL redo completed). Volume now ~79%.
- **Fixes:** `0c950b7` (API pool error handler; `restart: unless-stopped` for api/web), `89a7e22` (bg-deploy applies the
  deployed image's migrations; host fallback refuses a working tree that differs). Found during this: the earlier deploy had
  applied migrations 064/065 from the working tree before they were committed (empty tables, identical to the committed files).

## Audit output (production, 2026-11-11, after the last deploy)
```
seed 7:  all PASS (noindex-in-sitemap 0, non-self canonicals 0, missing JSON-LD 0, entity bugs 0,
         duplicate titles 0, descriptions>=80 60/60, image 60/60, host links 5/5; offers INFO 0%)
seed 1:  all PASS except entity-encoding 1 — ecstatic-dance-temple-andamp-cacao-…: the stored title itself
         holds "&amp;" (double-encoded upstream). Importer fix 367dd8b decodes it; clears on its republish.
```
Re-run 2026-11-11 16:50 UTC, after the republish: seeds 1 and 11 all PASS (5,976 event URLs in the sitemaps;
entity bugs 0, duplicate titles 0, descriptions ≥ 80 60/60, image 60/60, host links 5/5).

## Found along the way (fixed)
- **Rollback.** `bg:rollback` switched Apache to the stopped colour (bg-deploy stops it after every deploy), so it would have taken the site down. It now starts the colour and waits for health first. `bg:cleanup` failed without `--env-file` and now refuses to stop the active colour. The API now exits on SIGTERM instead of being killed after 10 s.
- **Rate limits.** The per-IP limits were global: Fastify had no `trustProxy`, so every visitor shared the Docker gateway IP. It now trusts the private-range proxies and evicts idle buckets.
- **Daily report.** It flagged the stopped standby colour as WARN; the standby colour now reports OK (active-colour or OOM exits still warn).
- **ecstaticdance.**
  - 167 of 211 dates fell on a weekday the page never states. Dates are now weekday-checked, the site's own upcoming list is preferred, and a stale one-off is skipped instead of being given an invented date.
  - Superseded and now-dateless future rows are cancelled.
  - The timezone comes from the map pin when the city can't be geocoded.
  - Double-encoded titles are decoded.
- **Timezones (all sources).** About 1,000 upcoming in-person events were published as UTC.
  - `PlaceResolver` never derived a zone for points cached by `resolveLatLon()`.
  - The importer now records the zone each time was computed in (`events.timezone`, migration 0114), and the publisher prefers it.
  - `scripts/backfill_event_timezones.php` (dry run first) re-queues already-published events.

## Not done, and why
- **Task 2 `offers`:** intentionally not emitted (no price data). Owner decision.
- **Proposal A2 (redirect past dates to hubs):** not approved; revisit after 6–8 weeks of hub data.
- **City pages and hubs data:** waits for the owner's review of the two dry runs.
- **Timezone republish backfill:** waits for the owner. A one-shot reminder (`temporary/tz-backfill-reminder.sh`,
  root crontab, 2026-11-12 09:43 UTC) runs a fresh dry run and sends its summary to the Telegram alert chat. The 16:35 UTC
  dry run on 2026-11-11 found 190 events to resend (biodanza_au 55, gaga_people 47, ecstaticdance 29, osho_pune 29, …).
- **Dance Church cities:** the scraper only reads city schedules linked from the homepage (LA, Seattle, New York). Classes
  in other cities (e.g. San Francisco, Atlanta) appear only on `/upcoming` and are not imported. That is a coverage gap, not SEO.
- **Existing slugs (`…-andamp-…`, `item-116`):** unchanged by rule ("no URL changes in this round"). The slug history now makes a future rename safe.
