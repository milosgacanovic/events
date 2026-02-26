# API Contracts (MVP)

Base path: `/api`

## Public
- `GET /api/health`
- `GET /api/meta/taxonomies` (practices taxonomy is currently canonical flat level-1 list)
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
- `POST /api/organizers`
- `PATCH /api/organizers/:id`
- `POST /api/events`
- `PATCH /api/events/:id`
- `POST /api/events/:id/publish`
- `POST /api/events/:id/unpublish`
- `POST /api/events/:id/cancel`
- `POST /api/uploads`

## Admin only
- `POST /api/admin/practices`
- `PATCH /api/admin/practices/:id`
- `POST /api/admin/organizer-roles`
- `PATCH /api/admin/organizer-roles/:id`
- `GET /api/admin/ui-labels`
- `PATCH /api/admin/ui-labels`

See `constitution.md` for complete behavior and field-level requirements.

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
