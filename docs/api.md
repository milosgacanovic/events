# API Contracts (MVP)

Base path: `/api`

## Public
- `GET /api/health`
- `GET /api/meta/taxonomies` (practices taxonomy is currently canonical flat level-1 list)
- `GET /api/meta/cities` (`q`, optional `countryCode`, optional `limit<=20`)
- `GET /api/meta/tags` (`q`, optional `limit<=20`)
- `GET /api/meta/organizer-cities` (`q`, optional `countryCode`, optional `limit<=20`)
- `GET /api/meta/organizer-tags` (`q`, optional `limit<=20`)
- `GET /api/events/search` (returns `hits`, `facets`, `pagination`)
- `GET /api/events/:slug` (includes `seo: { indexable, nextOccurrence }`, see below)
- `GET /api/events/:slug/redirect` (`{ slug }` — current slug of an event that used to live at `:slug`; `404` otherwise. See "Event Slugs")
- `GET /api/seo/sitemap/events` (returns `items: [{ slug, lastmod }]` — every indexable event page)
- `GET /api/organizers/search` (returns `items`, `facets`, `pagination`)
- `GET /api/organizers/:slug`
- `GET /api/map/clusters`
- `GET /api/geocode/search`
- `GET /api/uploads/*`

## Editor/Admin (Bearer token)
- `GET /api/admin/events` (supports optional `externalSource` + `externalId` pair filter)
- `GET /api/admin/events/:id`
- `GET /api/admin/organizers`
- `GET /api/admin/organizers/:id`
- `POST /api/admin/locations`
- `POST /api/admin/organizers/upsert-external`
- `POST /api/admin/events/:id/organizers/replace`
- `POST /api/organizers`
- `PATCH /api/organizers/:id`
- `POST /api/events`
- `PATCH /api/events/:id`
- `POST /api/events/:id/publish`
- `POST /api/events/:id/unpublish`
- `POST /api/events/:id/cancel`
- `POST /api/uploads`
- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/profile/alerts`
- `POST /api/profile/alerts`
- `DELETE /api/profile/alerts/:id`

## Admin only
- `POST /api/admin/practices`
- `PATCH /api/admin/practices/:id`
- `POST /api/admin/organizer-roles`
- `PATCH /api/admin/organizer-roles/:id`
- `GET /api/admin/event-formats`
- `POST /api/admin/event-formats`
- `PATCH /api/admin/event-formats/:id`
- `GET /api/admin/ui-labels`
- `PATCH /api/admin/ui-labels`
- `GET /api/admin/alerts/run-dry`

See `constitution.md` in this directory for complete behavior and field-level requirements.

## Search Query Conventions
- `practiceCategoryId`, `eventFormatId`, and `countryCode` accept CSV values for multi-select filters.
  - Example: `practiceCategoryId=<uuid1>,<uuid2>`
  - Example: `eventFormatId=<uuid1>,<uuid2>`
  - Example: `countryCode=de,rs`
- `practiceCategoryId` and `eventFormatId` CSV values are UUID-validated; invalid UUID list returns `400` with `error: "invalid_uuid_list"`.
- `GET /api/events/search` includes cache headers:
  - `Cache-Control: public, max-age=30`
  - `Vary: Authorization`

## Map Clusters Contract
- `GET /api/map/clusters` query params:
  - `bbox` (required): `west,south,east,north`
  - `zoom` (required): integer `0..20`
  - `from` (optional, ISO datetime, default now)
  - `to` (optional, ISO datetime, default now+90d)
  - `q` (optional text query against event title/slug)
  - filter parity with search:
    - `practiceCategoryId`, `practiceSubcategoryId`, `tags`, `languages`,
      `attendanceMode`, `organizerId`, `countryCode`, `city`, `hasGeo`
- Response is GeoJSON `FeatureCollection` with additive `truncated` flag:
  - cluster feature properties: `cluster: true`, `point_count`
  - leaf feature properties: `cluster: false`, `occurrence_id`, `event_slug`
  - `truncated: boolean` indicates server cap was hit before clustering.
- Server constraints:
  - only `published` occurrences
  - only rows with `geom`
  - server-side bbox filter
  - hard cap of `5000` rows before clustering
- Caching:
  - in-memory LRU TTL `30s`
  - key includes normalized filters + rounded bbox + zoom + date window

## Event Indexability (`seo`)
- `GET /api/events/:slug` returns `seo.indexable` and `seo.nextOccurrence` (`{ starts_at_utc, ends_at_utc }` of this event's own next not-yet-ended occurrence, or `null`).
- Both `seo.indexable` and `GET /api/seo/sitemap/events` use the shared `isEventIndexable()` predicate (`packages/shared/src/seo/indexability.ts`): published + public + an own occurrence that hasn't ended; for multi-sibling series, only siblings starting within 60 days plus the series' earliest upcoming sibling.
- The web page uses `seo.indexable` for robots (`noindex, follow` otherwise) and for whether Event JSON-LD is emitted. `lastmod` is `events.updated_at`.

## Event Search and Detail Payload Additions
- Public event payloads include importer transparency fields:
  - `isImported` (boolean)
  - `importSource` (string|null)
  - `externalUrl` (string|null)
  - `lastSyncedAt` (ISO timestamp|null)
- `GET /api/events/search` includes lightweight organizer refs on each hit:
  - `organizers: [{ id, name, avatarUrl, roles[] }]`

## Organizer Search Facets
- `GET /api/organizers/search` returns facets:
  - `roleKey`
  - `languages`
  - `tags`
  - `countryCode`
  - `city`
- Query params support CSV for multi-select:
  - `roleKey`
  - `languages`
  - `tags`
  - `countryCode`

## User Alerts (Skeleton)
- `POST /api/profile/alerts` payload:
  - `organizerId` (uuid, required)
  - `radiusKm` (int 1..500, optional, default 50)
  - `city` (string, optional)
  - `countryCode` (string, optional)
- `GET /api/profile/alerts` returns saved alert items for the authenticated user.
- `DELETE /api/profile/alerts/:id` removes a user-owned alert.
- `GET /api/admin/alerts/run-dry` returns dry-run matches for the next 30 days (admin-only).

## Host Entity Type (`entityType`)
- `organizers.entity_type` is `person` (default) or `organization`.
- `POST`/`PATCH /api/organizers` accept optional `entityType`; omitted on `PATCH` leaves it unchanged.
  `POST /api/admin/organizers/upsert-external` never sends it, so importer syncs keep an editor's choice.
- Returned as camelCase `entityType` by `GET /api/organizers/:slug`, `GET /api/organizers/search` items and
  `GET /api/admin/organizers/:id`.
- The public host page emits schema.org `Person` or `Organization` JSON-LD from it.

## Event Slugs (new events)
- Existing slugs never change automatically.
- `POST /api/events` builds the slug from the title (transliterated with any-ascii) + the city of `locationId`,
  then adds the first organizer's surname if taken, and a numeric suffix only as a last resort
  (`emerging-waves-den-haag`, `emerging-waves-den-haag-freitas`, `…-freitas-2`).
- Placeholder titles (`TBD`, `TBA`, `Untitled`, …) or titles with nothing usable after transliteration use
  city + organizer instead. No `item-NNN` slugs.
- Every slug change is recorded in `event_slug_history` by a DB trigger; `GET /api/events/:slug/redirect`
  resolves an old slug and the web event page answers with a permanent redirect (308).
  New slugs never reuse a slug that is in the history table.

## Host Slug Uniqueness (`POST`/`PATCH /api/organizers`)
- `organizers.slug` is unique. When `slug` is omitted on create the server
  generates a free one; when the client supplies it, the value is used verbatim.
- A supplied slug that is already taken returns `409` with:
  - `error: "slug_taken"`
  - `slug` — the rejected value
  - `existingHost` — `{ id, name, slug, status }` of the host holding it, or
    `null` if it could not be resolved. Includes draft/archived hosts, so the
    caller can be pointed at a record that is invisible in public search.

## Event Import Idempotency (Single/Recurring Event Create/Patch)
- `POST /api/events` accepts optional `externalSource` and `externalId` (`string|null`, max 255 each).
- `PATCH /api/events/:id` accepts optional `externalSource` and `externalId` with same constraints.
- Pair rule:
  - if one is provided, both must be provided
  - patch clear is allowed only with both set to `null`
- Server-enforced uniqueness:
  - unique pair `(external_source, external_id)` is enforced when both are non-null
  - duplicate create/update pair returns `409` with:
    - `error: "external_ref_conflict"`
    - `externalSource`
    - `externalId`
- `descriptionJson.importMeta` is optional and audit-only, not idempotency enforcement.

## Series Grouping (`seriesId`)
- `POST /api/events` and `PATCH /api/events/:id` accept optional `seriesId` (`uuid|null`).
- Purpose: collapse sibling events that belong to the same recurring source
  series (e.g. an imported weekly class parsed into N rows) into a single
  card/pin in search and map results.
- Stability: the value **must be stable across re-publishes** and identical for
  all siblings in a detected series. Recommended: UUID v5 with a fixed
  namespace and input `${source}:${sourceSeriesKey}`.
- Default: if omitted on create, server sets `series_id = event.id` so every
  event is always a member of some series (of one).
- PATCH behavior: omit the field to preserve the stored value; providing
  `seriesId` overwrites it.
- The field is echoed back in event responses (`series_id` / `seriesId` on
  admin detail endpoints).
- Grouping behavior (Meilisearch `distinctAttribute`, map pin dedup) is gated
  by the server env flag `EVENTS_SERIES_GROUPING_ENABLED` (default `false`).
  The schema and storage ship unconditionally so importers can start sending
  `seriesId` before the UX is turned on.

## Event Cover Image (Phase 1)
- Storage field remains `events.cover_image_path` (nullable text).
- `POST /api/events` and `PATCH /api/events/:id` accept:
  - `coverImageUrl` (`string|null`, optional): absolute `http/https` URL only, max length `2048`.
  - `coverImagePath` (`string|null`, optional): legacy/backward-compatible alias.
- If both `coverImageUrl` and `coverImagePath` are provided and non-null, they must match.
- Public responses include `coverImageUrl` (nullable):
  - `GET /api/events/search` at `hits[].event.coverImageUrl`
  - `GET /api/events/:slug` at `event.coverImageUrl`
- External image hosts must allow direct cross-origin browser loading.
