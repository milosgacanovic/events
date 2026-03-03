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
- `GET /api/events/:slug`
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

See `constitution.md` for complete behavior and field-level requirements.

## Search Query Conventions
- `practiceCategoryId`, `eventFormatId`, and `countryCode` accept CSV values for multi-select filters.
  - Example: `practiceCategoryId=<uuid1>,<uuid2>`
  - Example: `eventFormatId=<uuid1>,<uuid2>`
  - Example: `countryCode=de,rs`
- `practiceCategoryId` and `eventFormatId` CSV values are UUID-validated; invalid UUID list returns `400` with `error: "invalid_uuid_list"`.
- `GET /api/events/search` includes cache headers:
  - `Cache-Control: public, max-age=30`
  - `Vary: Authorization`

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
