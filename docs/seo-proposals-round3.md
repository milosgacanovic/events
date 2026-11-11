# SEO round 3: design note for Proposals A–C

**Status:** proposal only. Nothing in this note has been built. Each proposal needs the owner's approval first.
**Source:** handoff `1794314428024_f0d8fc057ce5_handoff.md`, section "Proposals".
**Data snapshot:** production DB, read-only, 2026-11-11 08:21 UTC. Every number below comes from a query in the [Appendix](#appendix-queries); `Qn` points to the query.
**Already deployed in this round:** PR1–PR3. Every live occurrence page is self-canonical. Past pages serve `noindex, follow`. The shared `isEventIndexable()` predicate indexes multi-sibling series only within 60 days, plus each series' earliest upcoming sibling. Sibling links appear in the "Upcoming" list.

## How the data is shaped (applies to A and B)

- **One page per date.** There are 45,496 published+public events (Q1). Almost all are imported single events: 45,487 are imported singles, and only 2 are native `rrule` events (Q3). An imported recurring class is N separate event rows, one page per date. They share `events.series_id`, which is a UUIDv5 of an importer `series_key`, for example `5rhythms:class:<upstreamId>`. A denormalized `event_series` row exists per series (migration 036). That table matches the base tables: 802 vs 803 live multi-sibling series (Q30).
- **Occurrence window.** `event_occurrences` covers about 30 days back. Older past pages therefore have no occurrence rows, and "past" is decided from `single_end_at`.
- **Sitemap mirror is exact.** My SQL copy of the sitemap predicate gives **5,633** indexable event pages. The live sitemap lists **5,633** event URLs across 6 chunks (Q6).
- **Routing.** Apache proxies every path to the web container, so new routes need no Apache change. The locale comes from a cookie (`dr_locale`) and there are no locale URL prefixes. Googlebot therefore sees English. New visible strings still need entries in all 35 catalogs, RTL included.

---

## A. Series hub pages (`/series/<slug>`)

### Approach
- **Who gets a hub.** Only multi-sibling series with **≥ 2 upcoming occurrences**. A single native `rrule` event already has one stable URL, so it needs no hub.
- **What the hub shows.** A server-rendered page with:
  - the title, the organizer(s), and venue/city;
  - a schedule summary, using the existing cadence inference;
  - real `<a href>` links to every upcoming occurrence;
  - links to the host page(s).
- **Markup and indexing.**
  - No `Event` JSON-LD. `EventSeries` is valid schema.org but not a Google rich-result type. `BreadcrumbList` is optional.
  - The hub is self-canonical and listed in a new `sitemap-series.xml`.
  - If a series drops below the threshold, the hub stays 200 but becomes `noindex`, with no 404 flapping.
- **Links into the hub.** Every occurrence page links to its hub ("All dates"), and so does the host page.
- **Leaf pages are unchanged.** Occurrence pages remain Google's per-event pages under the 60-day rule.
- **Slugs.** Reuse the Task 7 slug generator: title + city, then organizer surname, then numeric suffix last. Store slugs in a new `series_slugs(slug pk, series_id, is_current, created_at)` table so the hub URL does not depend on `series_id`. A slug-history row lets a hub follow a re-keyed series (see risks). This mirrors the `event_slug_history` table in the in-progress, uncommitted Task 7 migration `063`.
- **Data path.**
  - API: `GET /series/:slug` and `GET /seo/sitemap/series`.
  - `hubSlug` added to the event-detail payload.
  - Hub rows come from `event_series`, upcoming dates from `event_occurrences`.

### Affected counts
| Item | Count | Q |
|---|---|---|
| Distinct series (published+public) | 15,876 | Q4 |
| …with more than one page (multi-sibling) | 1,807 | Q4 |
| …with ≥ 1 upcoming occurrence | 803 | Q4 |
| **…with > 1 upcoming occurrence (proposed hubs)** | **538** | Q4 |
| …fully past ("dead" series, no upcoming date) | 1,004 | Q4 |

Live series by number of upcoming occurrences (Q7): 1 → **265**, 2–4 → 45, 5–9 → 19, 10–25 → 236, 26+ → 238.

Breakdown of the 803 live series by source (Q8):

| Source | Live series | With > 1 upcoming |
|---|---|---|
| 5rhythms | 450 | 412 |
| ecstaticdance | 199 | **0** |
| movementmedicine | 90 | 67 |
| openfloor | 29 | 29 |
| other sources | 35 | 30 |

**Ecstaticdance series are always 1 upcoming + past.** The scraper only sees the next date. A hub for one of these would hold a single link, so the ≥ 2 threshold excludes them.

**Sibling pages: 31,427** in total (Q5):

- **Upcoming: 12,978.**
  - 4,038 are indexable today.
  - 8,940 are `noindex` because they start more than 60 days out. These are exactly the pages a hub would cover for "later dates".
- **Past: 18,449. This is the redirect candidate pool.**
  - 7,158 belong to series with ≥ 2 upcoming dates, which would get a hub (Q31).
  - 1,091 belong to series with exactly 1 upcoming date (Q31).
  - 10,200 belong to dead series with no upcoming dates.
  - Only 2,479 of the past pages are still inside the 30-day occurrence window. The rest are older.

**Redirect churn:** 410 sibling pages end in the next 7 days, and 621 ended in the last 7 days (Q32). That is roughly 400–600 new redirects per week, indefinitely.

**Data quality:**
- 793 of 803 live series are coherent: one title, one city, one organizer set (Q9). The 9 exceptions are mostly movementmedicine, whose `series_key` comes from a teacher-page URL and can join unrelated workshops. Example: "New Year Dance Ceremony" with "The Art of Being Present".
- 152 of 803 live series share a base slug with another series (Q10). Examples: `emerging-waves` ×29, `sweat-your-prayers` ×10, `item` ×3 (non-Latin titles). Hub slugs therefore need the title+city(+surname) scheme and transliteration, which means **Task 7 is a prerequisite**.
- **Series identity churn:** 110 of the 1,004 dead series have a live "twin" with the same title and first organizer (Q14), for example 68 in 5rhythms. The upstream re-keyed them, so `series_id` changed. A hub keyed on `series_id` would lose its URL. Keying on `series_slugs`, with an auto-merge rule (same title + organizer + city, old series has no upcoming) or an admin merge, solves this.

### Migration / redirect plan: conflicts with this round's rules
Two parts of the proposal change existing URLs or the "do not change" behaviour:

1. **The 301 from past occurrences conflicts with:**
   - Ground rule 4: no URL changes for existing pages.
   - "Already correct — do not change": archived events serve `noindex, follow` and show a banner.
   - Task 4 step 3, already deployed: past occurrences are `noindex`.
2. Hub URLs themselves are new and additive, so there is no conflict.

**Proposed staging:**
- **A1 (additive, needs approval):**
  - migration plus `series_slugs` backfill script (`--dry-run` prints counts and 10 sample slugs, then stop for review);
  - hub route, hub sitemap, and the "All dates" links;
  - no redirects. Past pages stay `noindex, follow` and gain a prominent "See upcoming dates →" link to the hub.
- **A2 (URL change, separate explicit sign-off after 6–8 weeks of A1 data):**
  - `permanentRedirect()` in `events/[slug]/page.tsx` when the event is past **and** its series has a live, indexable hub;
  - dead-series pages (10,200) keep `noindex`, because redirecting into an empty or noindexed hub is pointless;
  - pilot on one source first (for example openfloor, 29 series), then all.

### Risks
- **Weak premise for "ranking signals accumulate".** Each occurrence page lives a few weeks and rarely earns external links. Google may treat a redirect to a non-equivalent page (one dated event → a schedule) as a soft 404, and it may not pass signals. The hub gets most of its value from internal links, and A1 provides those without any redirect. **Check first:** in Search Console, how many clicks or backlinks do past occurrence URLs actually have?
- **Permanent redirects are sticky.** Browsers and Cloudflare cache 301s. If a hub slug later changes, through a merge or re-key, old redirects point at the wrong place. The slug-history table mitigates this.
- **User impact.** A redirect hides the archived page with its details, comments, and RSVP history. Today that affects 11 past sibling pages with saves, 1 with RSVPs, and 4 with comments (Q11). Notification emails that link to past dates would also land on the hub.
- **Thin hubs.** 265 live series have exactly 1 upcoming date, hence the ≥ 2 threshold. Series with wrong or merged titles (9) produce misleading hubs, so use the most common sibling title rather than the canonical sibling's.
- **Route reservation.** `/series` is free: no event or organizer has the slug `series` (Q24).

### Effort (rough, one engineer)
| Phase | Work | Estimate |
|---|---|---|
| A1 | Migration + slug backfill (dry-run) | 0.5–1 d |
| A1 | API: hub, sitemap, `hubSlug` | 1 d |
| A1 | Web page + metadata + sitemap + links | 1.5 d |
| A1 | i18n: about 10–15 new strings × 35 locales | 0.5 d |
| A1 | QA + extend `scripts/seo_audit.py` | 0.5 d |
| **A1 total** | | **≈ 4–4.5 days**, after Task 7 |
| A2 | Redirect logic, tests, pilot | ≈ 1 day + 2–4 weeks of monitoring |

---

## B. City landing pages (`/events/in/<country>/<city>`)

### Approach
- **Route.** `app/events/in/[country]/[city]/page.tsx`.
  - Country is an ISO-3166 alpha-2 code, lowercase (`nl`), so it needs no translation.
  - City is a slug of a **normalized** city name (see below).
  - The static `in` segment takes precedence over `events/[slug]`. No event currently has the slug `in` (Q24). `in` must be added to a reserved-slug list in the slug generator. The in-progress `apps/api/src/utils/eventSlug.ts` has no such list yet.
  - This adds new URLs and changes no existing URL, so ground rule 4 is satisfied.
- **Page content, all server-rendered:**
  - H1 and `<title>`: "Conscious dance events in {City}". Description templated from real counts and the practices present.
  - Upcoming events: one row per series, showing the next date and linking to that occurrence page.
  - Hosts active in the city, and a link back to `/events`.
  - Self-canonical, with no `Event` markup on a listing page. `BreadcrumbList` is optional.
- **Sitemap.** New `sitemap-cities.xml`, with `lastmod` = the newest `updated_at` among the listed events.
- **robots.txt is unchanged.**
  - `/events?*` stays disallowed, which covers `/events?city=`. `/events/in/...` is a path, so the existing `allow: /events` already covers it.
  - Side note: the same rule also blocks `/events?practice=…`, which `/events` advertises as an indexable canonical. That inconsistency already exists; this note doesn't change it.
- **Internal links.** Event pages currently link the city name to the blocked `/events?city=…&countryCode=…` (`EventDetailClient.tsx:1301`). When a city page exists, link to it instead. This is a link change, not a URL change.
- **Threshold, counted in distinct upcoming series rather than occurrences.** One weekly class is 26 "events", so counting occurrences overstates real choice:

| Rule (in-person + hybrid, upcoming) | Cities (Q16) |
|---|---|
| ≥ 5 upcoming occurrences | 266 |
| ≥ 10 upcoming occurrences | 248 |
| ≥ 5 indexable event pages | 249 |
| ≥ 3 distinct series | 171 |
| **≥ 5 distinct series** | **88** |
| **≥ 10 distinct series** | **34** |

- **Effect of normalization.** Merging case, diacritic, and exonym variants while dropping rows with no country moves the thresholds only slightly: ≥ 5 series = 87, ≥ 10 = 33 (Q22). Normalization mostly matters for page correctness, not for these counts.
- **Single-host cities.** 17 of the 88 cities have a single host (Q23), for example Dharamshala 20 series, Sarnen OW 15, Plainfield 14, Wallkill 12, Bielefeld 12, Dubai 11. These pages would just duplicate a retreat center's host page. Proposed rule: **≥ 5 distinct series and ≥ 2 hosts → 71 cities**.
- **Hysteresis.** Create a page at the threshold. Turn it `noindex`, keeping the 200 status, only after it has been below 3 series for 30 days. That stops weekly flapping.

**Top 20 cities by distinct upcoming series** (raw city string; Q17). "Indexable pages" means indexable under today's predicate.

| # | Country | City | Series | Upcoming occurrences | Indexable pages |
|---|---|---|---|---|---|
| 1 | GB | London | 70 | 559 | 205 |
| 2 | DE | Berlin | 36 | 177 | 73 |
| 3 | CH | Bern | 31 | 149 | 62 |
| 4 | IN | Pune | 31 | 31 | 31 |
| 5 | US | Seattle | 27 | 51 | 34 |
| 6 | US | Los Angeles | 25 | 25 | 25 |
| 7 | US | New York City | 24 | 24 | 24 |
| 8 | FR | Paris | 23 | 262 | 68 |
| 9 | IT | Bologna | 23 | 23 | 23 |
| 10 | ID | Ubud | 21 | 94 | 43 |
| 11 | IN | Dharamshala | 20 | 20 | 20 |
| 12 | NL | Amsterdam | 19 | 217 | 82 |
| 13 | AT | Vienna | 18 | 174 | 56 |
| 14 | IT | Rome | 17 | 77 | 31 |
| 15 | US | Portland | 17 | 42 | 25 |
| 16 | CH | Sarnen OW | 15 | 15 | 15 |
| 17 | GB | Brighton | 14 | 104 | 38 |
| 18 | DE | Freiburg | 14 | 38 | 21 |
| 19 | ZA | Cape Town | 14 | 14 | 14 |
| 20 | US | Plainfield | 14 | 14 | 14 |

Several rows above are split across spellings. For example, Paris also appears as `paris`, Vienna as `Wien`, and Rome as `Roma`.

### City-name normalization problems found
Upcoming in-person occurrences have 765 distinct (country, city) pairs (Q16, Q20). Coverage gaps (Q15): 246 of 12,601 upcoming in-person occurrences have no city, and 128 have no country.

| Problem | Examples (count of upcoming series) | Q |
|---|---|---|
| Case variants (10 groups) | `Bologna`/`BOLOGNA` (24), `paris`/`Paris` (24), `basel`/`Basel`, `Siena`/`SIENA`, `Rumson`/`RUMSON`, `Tel aviv`/`Tel Aviv`; 12 all-caps and 5 all-lowercase pairs | Q18, Q20 |
| Diacritics | `Zurich`/`Zürich` (14), `Lutzelfluh`/`Lützelflüh` (7); `Saarbrücken` stored in decomposed Unicode form (NFD) | Q18, Q25 |
| Language / exonym (14 groups) | `Vienna`/`Wien` (31), `Rome`/`Roma` (21), `Geneva`/`Genève`, `Warsaw`/`Warszawa`, `Lucerne`/`Luzern`, `Copenhagen`/`København`, `Munich`/`München`, `Lisbon`/`Lisboa`, `Ghent`/`Gent`, `Milan`/`Milano` | Q19 |
| Den Haag vs The Hague | Upcoming data has only `Den Haag`. All occurrences: `Den Haag` 30, `The Hague` 1. `locations` table: `Den Haag` 2, `The Hague` 5 | Q21 |
| Districts vs city | `New York City` / `New York` / `Brooklyn` (33 series combined) | Q19 |
| Missing country code | 79 pairs. The same city appears with and without a country: London (72 series), Berlin (37), Vienna (20), Dubai (16), Brighton, Barcelona | Q20 |
| Wrong country code | `Antwerpen` tagged **NL**, while `Antwerp` is BE | Q19 |
| Not a city | Regions: `Noord-Brabant`, `Colorado`, `Central Europe`, `La Gomera`, `Ardeche`. Codes: `DXB`, `Bham`. Junk: `and Meditation` | Q20 |
| Address or venue text | `L- 1147 Luxembourg`, `A92DF7X`, `7630)364 Colos`, `Goodman Arts Centre Blk M #02-53 SG`, `Metro Diego de León - L4`, `Salle les 7 arts au Forum à Bayonne`; canton suffix `Sarnen OW` | Q9, Q20 |

**Proposed normalization layer.**
1. Add a `cities` table: `(country_code, city_key, display_name, slug, approved)`, plus `city_aliases(country_code, raw_city → city_key)`. Seed both from these queries: NFC, then lowercase, then strip diacritics, then the exonym map.
2. **The owner approves the list of cities that get a page.** That is about 70–90 rows, reviewed once. Junk, regions, and unknown values never get a page.
3. Fix the worst values at ingestion later; that is an importer task. Possible fixes: prefer the geocoder locality from `place_id`, and infer the country from `geom`.

The same normalization would also fix city facets in `/events` search, because they match the raw `lower(city)` today.

### Migration / redirect plan
- Nothing is redirected, and no existing URL changes.
- The only edit on existing pages is the city link target on event pages, and later host pages.
- If a city is later merged (for example `wien` into `vienna`), the old city slug 301s to the new one through `city_aliases`. These URLs are new, so a merge doesn't conflict with this round's rule.

### Risks
- **Doorway pages.** Google's spam policies name thin, near-identical city pages as doorways. Mitigations:
  - the series threshold, the ≥ 2-host rule, and the hysteresis above;
  - real listings rather than boilerplate text;
  - no pages for small towns.
- **Staleness.** Lists change daily. Revalidate every 10 minutes, as the sitemaps do, and keep `lastmod` honest.
- **Wrong URL choice is costly later.** Choose the English exonym vs endonym slug policy before launch (see open questions). Changing it later means 301s.
- **Rate limits.** The web container is a single IP to the API. Use one cached `/seo/cities` call, not per-city fan-out at build time.

### Effort (rough)
| Work | Estimate |
|---|---|
| Normalization tables + seed script (`--dry-run`) + review export | 1.5–2 d |
| API: city list with thresholds, city payload, sitemap | 1 d |
| Web: route, metadata, sitemap, link swap on event pages | 1.5 d |
| i18n: about 8–12 strings × 35 locales | 0.5 d |
| QA | 0.5 d |
| **Total** | **≈ 5–5.5 days**, plus about 1–2 h of owner review of the city list |

---

## C. Thin-host policy

### Rule tested
A published host is a candidate when all three hold:
1. it has **no upcoming** published+public event;
2. it has **no published+public event that started in the past 12 months**;
3. its **visible bio is under N characters**. The visible bio is the field the host page renders: `description_html`, falling back to `description_json.description`/`html`/`text`. Length is plain text after stripping tags, decoding the common entities, and collapsing whitespace. This is an SQL approximation of `htmlToPlainText`.

### Counts
| | Hosts | Q |
|---|---|---|
| Published hosts | 1,757. The live `sitemap-hosts.xml` lists the same 1,757 slugs | Q26 |
| …with an upcoming event | 707 | Q26 |
| …no upcoming, but an event in the past 12 months | 377 | Q26 |
| …inactive under rules 1+2 (any bio) | 673 | Q26 |

| Bio threshold (inactive hosts only) | Candidates | Of which in host sitemap today |
|---|---|---|
| < 200 chars | 552 | 552 |
| **< 300 chars (stated rule)** | **565** | **565** |
| < 500 chars | 593 | 593 |
| Any length | 673 | 673 |
| *(empty bio)* | *543* | |

**The bio threshold barely matters.** 543 of the 565 candidates have no bio at all (Q26). The rule really amounts to "inactive and no bio".

**Who the 565 are** (Q27, Q29):

| Group | Hosts | Detail |
|---|---|---|
| Never linked to any event | 283 | Imported directory profiles: openfloor 216, 5rhythms 43, others |
| Linked only to **cancelled** events | 281 | kripalu 210, esalen 32, omega 13, consciousdancer 10, others. The cancelled events' `updated_at` falls between 2026-05-09 and 2026-11-11 |
| Other | 1 | |

| Property | Hosts |
|---|---|
| Imported (not native) | 565 |
| Claimed by a user (`host_users`) | 0 |
| With a website URL | 10 |
| With an image | 266 |
| Created in the last 90 days | 14 |

| Source | Candidates / all hosts from that source |
|---|---|
| openfloor | 217 / 286 |
| kripalu | 210 / 219 |
| 5rhythms | 43 / 517 |
| esalen | 40 / 43 |
| omega | 13 / 13 |
| consciousdancer | 11 / 94 |
| movementmedicine | 4 / 140 |
| 14 small sources | 27 total |

**Sensitivity to cancelled events.** If cancelled events also counted as "activity", candidates drop from **565 to 304** (Q26). I recommend not counting them. Cancellations here are importer churn or source shutdowns, not real activity: for example, 17,983 cancelled 5rhythms events, of which 6,297 are future-dated (Q28).

**Current state, two sampled candidates.** `hosts/abiola-abrams` (kripalu) and `hosts/adam-frost` (openfloor) both serve `index, follow`. Their meta description is the fallback "X — conscious dance host on DanceResource", and their HTML has no `/events/` links.

### Approach
- **Shared predicate.** Add `isHostIndexable(host, now)` in `packages/shared/src/seo/`, alongside `isEventIndexable`. Use it in **both** places so they cannot drift:
  - the host page's robots meta, which becomes `noindex, follow`;
  - a new `GET /seo/sitemap/hosts` endpoint, which filters with the same predicate.
- **Replace the current host sitemap source.** It pages `/organizers/search` 50 at a time, about 36 requests. The new endpoint replaces that, which also eases the per-IP rate-limit pressure.
- **Move the text helper.** Move `htmlToPlainText` from `apps/web/lib` to `packages/shared` so the API measures bio length exactly as the page renders it.
- **No URL change and no 404.** The page stays 200 and reachable. It becomes indexable again automatically when an event is added or a bio is written, within the sitemap's 10-minute cache.

### Migration / redirect plan
None. Both the `noindex` and the sitemap removal are fully reversible and compatible with ground rule 4. No DB writes are needed.

### Risks
- **Visibility loss for real teachers.**
  - Kripalu, Esalen, and Omega presenters are real people. Their profiles disappear from search until their source is revived.
  - Low practical risk: no candidate is claimed, and 543 have no bio.
  - Alternative to `noindex`: enrich bios from the source directories. That is an importer task.
- **Task 6 interaction.** Task 6 (server-rendered event links and Person/Organization schema) is still open. C changes only robots and the sitemap, so the two are independent.
- **Recrawl lag.** Google takes weeks to drop the pages. Expect "Excluded by noindex" in Search Console to grow by about 565.

### Effort (rough)
About **1–1.5 days**: predicate and tests, sitemap endpoint, page metadata, and moving the shared util. There are no visible strings, so no i18n.

---

## Recommendation and open questions for the owner

**Recommended order: C → B → A1, then decide A2.**

1. **C: approve as stated.** That is 565 hosts, using published events only. It is cheap, reversible, and has no URL changes.
2. **B: approve with "≥ 5 distinct upcoming series and ≥ 2 hosts" (71 cities).** Build the curated city table first. Purely additive.
3. **A1: approve hubs for series with ≥ 2 upcoming dates (538), with no redirects.** It depends on Task 7's slug generator.
4. **A2: do not approve the 301s yet.** Re-decide after 6–8 weeks of hub data, and only after checking in Search Console that past occurrence URLs have clicks or backlinks worth consolidating. Dead series (10,200 pages) stay `noindex` in every scenario.

**Open questions**
- **A:** Hub threshold: ≥ 2 upcoming (538) or ≥ 1 (803)? Path `/series/<slug>` OK?
- **A:** If A2 goes ahead, pilot on one source first?
- **B:** Threshold: ≥ 5 series (88), ≥ 5 series and ≥ 2 hosts (71), or ≥ 10 series (34)?
- **B:** City name in URL and title: English exonym (`/events/in/at/vienna`) or local name (`…/wien`)? I recommend English, since crawled pages are English and the target queries are English.
- **B:** Districts: does Brooklyn get its own page or merge into New York?
- **C:** Should cancelled events count as activity (565 → 304)?
- **C:** Should directory-only profiles keep being imported at all? About 216 openfloor + 43 5rhythms are never linked to an event. That is an importer policy question.

---

## Appendix: queries

All queries ran **read-only**: `docker exec … psql` with `PGOPTIONS='-c default_transaction_read_only=on'`, against the production DB at 2026-11-11 08:21 UTC. "Published+public" always means `e.status='published' and e.visibility='public'`. Counts drift daily as importers run.

```sql
-- Q1 events by status/visibility
select status, visibility, count(*) from events group by 1,2 order by 1,2;

-- Q2 occurrence window
select min(starts_at_utc), max(starts_at_utc), count(*) total,
  count(*) filter (where ends_at_utc >= now()) upcoming,
  count(*) filter (where ends_at_utc < now()) past from event_occurrences;

-- Q3 schedule kind / imported (published+public)
select schedule_kind, is_imported, count(*) from events
where status='published' and visibility='public' group by 1,2;

-- Q4 series overview
with pe as (
  select e.id, e.series_id, e.schedule_kind,
    exists (select 1 from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) has_up,
    (select count(*) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) n_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, count(*) sib, count(*) filter (where has_up) sib_up, sum(n_up) occ_up,
  bool_or(schedule_kind='recurring') any_rrule from pe group by series_id)
select count(*) total_series,
  count(*) filter (where sib=1) single_page_series,
  count(*) filter (where sib>1) multi_sibling_series,
  count(*) filter (where sib>1 and occ_up>=1) multi_with_ge1_upcoming,
  count(*) filter (where sib>1 and occ_up>1) multi_with_gt1_upcoming,
  count(*) filter (where sib>1 and occ_up=0) multi_fully_past,
  count(*) filter (where sib=1 and any_rrule) native_rrule_series
from s;

-- Q5 sibling pages by state (mirrors isEventIndexable, 60-day window)
with pe as (
  select e.id, e.series_id,
    (select min(eo.starts_at_utc) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) next_start,
    exists (select 1 from event_occurrences eo where eo.event_id=e.id) has_occ
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, count(*) sib, min(next_start) series_next from pe group by series_id),
x as (select pe.*, s.sib, s.series_next from pe join s using (series_id) where s.sib>1)
select count(*) sibling_pages_total,
  count(*) filter (where next_start is not null) upcoming_sibling_pages,
  count(*) filter (where next_start is not null and (next_start<=series_next or next_start<=now()+interval '60 days')) upcoming_indexable_60d,
  count(*) filter (where next_start is not null and not (next_start<=series_next or next_start<=now()+interval '60 days')) upcoming_noindex_beyond_60d,
  count(*) filter (where next_start is null) past_sibling_pages,
  count(*) filter (where next_start is null and series_next is not null) past_in_live_series,
  count(*) filter (where next_start is null and series_next is null) past_in_dead_series,
  count(*) filter (where next_start is null and has_occ) past_with_materialized_occ,
  count(*) filter (where next_start is null and not has_occ) past_older_than_window
from x;

-- Q6 total indexable (mirror of listIndexableEventsForSitemap); compared with
--    `curl https://events.danceresource.org/sitemap-events-{1..6}.xml | grep -c '<loc>'` = 5,633
with c as (
  select e.id, e.series_id,
    (select min(eo.starts_at_utc) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) next_start
  from events e where e.status='published' and e.visibility='public'),
w as (select c.*, count(*) over (partition by series_id) sib, min(next_start) over (partition by series_id) series_next from c)
select count(*) filter (where next_start is not null and (sib<=1 or next_start<=series_next or next_start<=now()+interval '60 days')) indexable_total
from w;

-- Q7 live multi-sibling series by number of upcoming occurrences
with pe as (
  select e.id, e.series_id,
    (select count(*) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) n_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, sum(n_up) up from pe group by series_id having count(*)>1 and sum(n_up)>0)
select case when up=1 then '1' when up between 2 and 4 then '2-4' when up between 5 and 9 then '5-9'
            when up between 10 and 25 then '10-25' else '26+' end bucket, count(*) series
from s group by 1;

-- Q8 live multi-sibling series by import source
with pe as (
  select e.id, e.series_id, e.import_source,
    (select count(*) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) n_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, min(import_source) src, sum(n_up) up from pe group by series_id having count(*)>1 and sum(n_up)>0)
select coalesce(src,'(native)') src, count(*) series, count(*) filter (where up>1) gt1_up from s group by 1 order by 2 desc;

-- Q9 series coherence (upcoming siblings of live multi-sibling series)
with up as (
  select e.id, e.series_id, e.title, eo.city, e.attendance_mode,
    (select string_agg(organizer_id::text, ',' order by organizer_id) from event_organizers eog where eog.event_id=e.id) orgs
  from events e join event_occurrences eo on eo.event_id=e.id and eo.ends_at_utc>=now()
  where e.status='published' and e.visibility='public'),
sibs as (select series_id from events where status='published' and visibility='public' group by series_id having count(*)>1),
s as (select series_id, count(distinct title) titles, count(distinct lower(coalesce(city,''))) cities,
   count(distinct coalesce(orgs,'')) orgsets, count(distinct attendance_mode) modes
  from up where series_id in (select series_id from sibs) group by series_id)
select count(*) live_series, count(*) filter (where titles>1) multi_title, count(*) filter (where cities>1) multi_city,
  count(*) filter (where orgsets>1) multi_orgset, count(*) filter (where titles=1 and cities=1 and orgsets=1) fully_coherent
from s;
-- (+ listing query: same CTEs, `having count(distinct title)>1 or count(distinct lower(coalesce(city,'')))>1`)

-- Q10 hub slug collisions (slug with numeric/random suffix stripped)
with pe as (
  select e.id, e.series_id, e.slug,
    exists (select 1 from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) has_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, mode() within group (order by regexp_replace(slug, '-[0-9a-z]{0,6}[0-9][0-9a-z]{0,5}$', '')) base
      from pe group by series_id having count(*)>1 and bool_or(has_up)),
b as (select base, count(*) n from s group by base)
select count(*) live_series, count(distinct s.base) distinct_bases,
  count(*) filter (where b.n>1) series_sharing_base
from s join b using (base);

-- Q11 user data on past sibling pages
with pe as (
  select e.id, e.series_id,
    exists (select 1 from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) has_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, count(*) sib from pe group by series_id),
past as (select pe.id from pe join s using (series_id) where s.sib>1 and not pe.has_up)
select (select count(distinct se.event_id) from saved_events se join past p on p.id=se.event_id) past_with_saves,
       (select count(distinct r.event_id) from event_rsvps r join past p on p.id=r.event_id) past_with_rsvps,
       (select count(distinct c.event_id) from comments c join past p on p.id=c.event_id) past_with_comments;

-- Q14 series identity churn: dead multi-sibling series with a live twin (same title + first organizer)
with pe as (
  select e.id, e.series_id, e.title, e.import_source,
    (select min(organizer_id::text) from event_organizers eog where eog.event_id=e.id) org,
    exists (select 1 from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) has_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, min(title) title, min(org) org, min(import_source) src, count(*) sib, bool_or(has_up) live from pe group by series_id),
dead as (select * from s where sib>1 and not live), live as (select * from s where live)
select d.src, count(*) dead_series,
  count(*) filter (where exists (select 1 from live l where l.title=d.title and l.org is not distinct from d.org)) with_live_twin
from dead d group by 1 order by 2 desc;

-- Q15 upcoming occurrences: city/country coverage
select e.attendance_mode, count(*) occ, count(*) filter (where eo.city is null or btrim(eo.city)='') no_city,
  count(*) filter (where eo.country_code is null) no_country
from event_occurrences eo join events e on e.id=eo.event_id
where e.status='published' and e.visibility='public' and eo.ends_at_utc>=now() and eo.status='published'
group by 1;

-- Q16 / Q17 (country, city) thresholds and top list (raw city string, in-person + hybrid)
with c as (
  select e.id, e.series_id,
    (select min(eo.starts_at_utc) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) next_start
  from events e where e.status='published' and e.visibility='public'),
w as (select c.*, count(*) over (partition by series_id) sib, min(next_start) over (partition by series_id) series_next from c),
u as (
  select upper(eo.country_code) cc, btrim(eo.city) city, e.id, e.series_id,
    (w.sib<=1 or w.next_start<=w.series_next or w.next_start<=now()+interval '60 days') idx
  from event_occurrences eo join events e on e.id=eo.event_id join w on w.id=e.id
  where e.status='published' and e.visibility='public' and eo.ends_at_utc>=now() and eo.status='published'
    and e.attendance_mode in ('in_person','hybrid') and eo.city is not null and btrim(eo.city)<>''),
g as (select cc, city, count(*) occ, count(distinct series_id) series, count(distinct id) filter (where idx) idx_pages from u group by 1,2)
select count(*) pairs,
  count(*) filter (where occ>=5) occ_ge5, count(*) filter (where occ>=10) occ_ge10,
  count(*) filter (where series>=3) series_ge3, count(*) filter (where series>=5) series_ge5,
  count(*) filter (where series>=10) series_ge10,
  count(*) filter (where idx_pages>=5) idxpages_ge5
from g;
-- Q17: same CTEs, `select cc, city, series, occ, idx_pages from g order by series desc, occ desc limit 20`

-- Q18 case / diacritic variants
with u as (
  select upper(eo.country_code) cc, eo.city raw, e.series_id
  from event_occurrences eo join events e on e.id=eo.event_id
  where e.status='published' and e.visibility='public' and eo.ends_at_utc>=now() and eo.status='published'
    and e.attendance_mode in ('in_person','hybrid') and eo.city is not null and btrim(eo.city)<>''),
n as (select cc, raw, series_id, regexp_replace(translate(lower(btrim(raw)),
   'áàâäãåāčćçďéèêëěēíìîïīñńňóòôöõøōřśšşťúùûüůūýÿžźżł', 'aaaaaaaccc deeeeeeiiiiinnnooooooorsssttuuuuuuyyzzzl'), '\s+', ' ', 'g') norm from u)
select cc, norm, string_agg(distinct raw, ' | ') variants, count(distinct series_id) series
from n group by cc, norm having count(distinct raw)>1 order by series desc;

-- Q19 exonym variants: join upcoming in-person (cc, city) on lower(city) against a hand-written
--     VALUES list of ~90 endonym/exonym pairs (Den Haag/The Hague/'s-Gravenhage, Wien/Vienna,
--     Roma/Rome, Genève/Geneva/Genf, Warszawa/Warsaw, Luzern/Lucerne, København/Copenhagen,
--     München/Munich, Lisboa/Lisbon, Antwerpen/Antwerp, Gent/Ghent, Milano/Milan, Tel Aviv variants,
--     New York/New York City/NYC/Brooklyn/Manhattan, …); group by pair, report distinct spellings.

-- Q20 other anomalies over the 765 distinct upcoming in-person (cc, city) pairs
with u as (
  select upper(eo.country_code) cc, btrim(eo.city) city, e.series_id
  from event_occurrences eo join events e on e.id=eo.event_id
  where e.status='published' and e.visibility='public' and eo.ends_at_utc>=now() and eo.status='published'
    and e.attendance_mode in ('in_person','hybrid') and eo.city is not null and btrim(eo.city)<>''),
d as (select cc, city, count(distinct series_id) series from u group by 1,2)
select count(*) distinct_pairs, count(*) filter (where city ~ '[0-9]') with_digits,
  count(*) filter (where length(city)>30) longer_than_30, count(*) filter (where city ~ ' [A-Z]{2}$') trailing_code,
  count(*) filter (where cc is null) null_country,
  count(*) filter (where city = upper(city) and city ~ '[A-Z]{3}') all_caps, count(*) filter (where city = lower(city)) all_lower
from d;
-- (+ listing of the flagged rows; + `group by lower(city) having count(distinct coalesce(cc,'∅'))>1` for cross-country names)

-- Q21 Den Haag / The Hague across tables
select 'event_occurrences(all)', city, upper(country_code), count(*) from event_occurrences
  where lower(city) in ('den haag','the hague','''s-gravenhage','scheveningen') group by 2,3
union all select 'locations', city, upper(country_code), count(*) from locations
  where lower(city) in ('den haag','the hague','''s-gravenhage','scheveningen') group by 2,3
union all select 'organizers.city', city, upper(country_code), count(*) from organizers
  where lower(city) in ('den haag','the hague','''s-gravenhage','scheveningen') group by 2,3
union all select 'organizer_locations', city, upper(country_code), count(*) from organizer_locations
  where lower(city) in ('den haag','the hague','''s-gravenhage','scheveningen') group by 2,3;

-- Q22 thresholds after light normalization (Q18 normalization + exonym CASE map; null-country rows dropped)
--     same shape as Q16 with `n` = case n when 'wien' then 'vienna' when 'roma' then 'rome' … end

-- Q23 single-host cities among the >=5-series cities
with u as (… same filter as Q16 …),
o as (select u.*, eog.organizer_id from u left join event_organizers eog on eog.event_id=u.id),
g as (select cc, city, count(distinct series_id) series, count(distinct organizer_id) hosts from o group by 1,2)
select count(*) filter (where series>=5) cities_ge5, count(*) filter (where series>=5 and hosts<=1) ge5_single_host,
  count(*) filter (where series>=10) cities_ge10, count(*) filter (where series>=10 and hosts<=1) ge10_single_host
from g;

-- Q24 route-segment conflicts
select 'events.slug', slug from events where slug in ('in','series','city','cities')
union all select 'organizers.slug', slug from organizers where slug in ('in','series');

-- Q25 decomposed-Unicode city strings
select count(distinct (upper(eo.country_code), eo.city)) from event_occurrences eo join events e on e.id=eo.event_id
where e.status='published' and e.visibility='public' and eo.ends_at_utc>=now() and eo.city is not null
  and eo.city is not nfc normalized;

-- Q26 Proposal C: host activity + visible bio length (published hosts)
with h as (
  select o.id, o.slug,
    length(btrim(regexp_replace(regexp_replace(replace(replace(replace(replace(
      coalesce(nullif(btrim(o.description_html),''), nullif(btrim(o.description_json->>'description'),''),
               nullif(btrim(o.description_json->>'html'),''), nullif(btrim(o.description_json->>'text'),''), ''),
      '&nbsp;',' '),'&amp;','&'),'&quot;','"'),'&#39;',''''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'))) bio_len,
    exists (select 1 from event_organizers eog join events e on e.id=eog.event_id join event_occurrences eo on eo.event_id=e.id
            where eog.organizer_id=o.id and e.status='published' and e.visibility='public' and eo.ends_at_utc>=now()) has_upcoming,
    exists (select 1 from event_organizers eog join events e on e.id=eog.event_id
            where eog.organizer_id=o.id and e.status='published' and e.visibility='public'
              and (e.single_start_at between now()-interval '12 months' and now()
                   or exists (select 1 from event_occurrences eo where eo.event_id=e.id
                              and eo.starts_at_utc between now()-interval '12 months' and now()))) has_past12,
    exists (select 1 from event_organizers eog join events e on e.id=eog.event_id
            where eog.organizer_id=o.id and e.status in ('published','cancelled')
              and (e.single_start_at between now()-interval '12 months' and now()
                   or exists (select 1 from event_occurrences eo where eo.event_id=e.id
                              and eo.starts_at_utc between now()-interval '12 months' and now()))) has_past12_incl_cancelled,
    exists (select 1 from event_organizers eog where eog.organizer_id=o.id) has_any_event
  from organizers o where o.status='published')
select count(*) published_hosts, count(*) filter (where has_upcoming) with_upcoming,
  count(*) filter (where not has_upcoming and has_past12) past12_only,
  count(*) filter (where not has_upcoming and not has_past12) inactive_12m,
  count(*) filter (where not has_upcoming and not has_past12 and bio_len<200) bio_lt200,
  count(*) filter (where not has_upcoming and not has_past12 and bio_len<300) bio_lt300,
  count(*) filter (where not has_upcoming and not has_past12 and bio_len<500) bio_lt500,
  count(*) filter (where not has_upcoming and not has_past12 and bio_len=0) bio_empty,
  count(*) filter (where not has_upcoming and not has_past12_incl_cancelled and bio_len<300) incl_cancelled_bio_lt300
from h;
-- Sitemap overlap: candidate slugs from this CTE vs
--   `curl https://events.danceresource.org/sitemap-hosts.xml` slugs (1,757), compared with `comm`.

-- Q27 / Q29 profile of the 565 candidates (same CTE as Q26, plus:)
--   n_links      = count(*) from event_organizers where organizer_id = o.id
--   n_cancelled  = … joined to events with status='cancelled'
--   claimed      = exists (select 1 from host_users where organizer_id = o.id)
--   grouped by external_source; never_linked = n_links=0; only_cancelled = n_links>0 and n_cancelled=n_links

-- Q28 cancelled events by source
select coalesce(import_source,'(native)') src, count(*) cancelled,
  count(*) filter (where single_start_at >= now()) start_future
from events where status='cancelled' group by 1 order by 2 desc;

-- Q30 event_series table cross-check
select count(*) filter (where upcoming_count>0 and sibling_count>1) multi_live,
       count(*) filter (where upcoming_count>1 and sibling_count>1) multi_gt1
from event_series where visibility='public';

-- Q31 past sibling pages by hub eligibility
with pe as (
  select e.id, e.series_id,
    (select count(*) from event_occurrences eo where eo.event_id=e.id and eo.ends_at_utc>=now()) n_up
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id, sum(n_up) up from pe group by series_id having count(*)>1)
select count(*) filter (where pe.n_up=0 and s.up>=2) past_in_ge2_series,
       count(*) filter (where pe.n_up=0 and s.up=1) past_in_1_series,
       count(*) filter (where pe.n_up=0 and s.up=0) past_in_dead_series
from pe join s using (series_id);

-- Q32 weekly churn of sibling pages turning past
with pe as (
  select e.id, e.series_id, (select max(eo.ends_at_utc) from event_occurrences eo where eo.event_id=e.id) last_end
  from events e where e.status='published' and e.visibility='public'),
s as (select series_id from pe group by series_id having count(*)>1)
select count(*) filter (where last_end between now() and now()+interval '7 days') ending_next_7d,
       count(*) filter (where last_end between now()-interval '7 days' and now()) ended_last_7d
from pe join s using (series_id);
```
