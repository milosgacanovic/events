# Importer Contract: Single Event Create + Publish (Strict Current API)

This document defines how an external importer must create and publish **single** events against the current API implementation.

Scope:
- single events only (`scheduleKind = "single"`)
- existing endpoints only (no new endpoints)
- strict to current validation and behavior

Base URL: `https://beta.events.danceresource.org/api`

## 1) Auth and Required Roles

All write operations below require Bearer JWT.

- Required for importer writes:
  - `POST /events`
  - `PATCH /events/:id`
  - `POST /events/:id/publish`
  - `POST /admin/locations`
  - `GET /admin/events` (used for lookup)
- Accepted role for these endpoints: `dr_events_editor` or `dr_events_admin`
- Failure modes:
  - `401` missing/invalid bearer token
  - `403` token without required role
  - `400` schema validation failure
  - `404` entity not found (patch/publish by wrong id)

## 2) Idempotency Strategy (`external_source + external_id`)

## 2.1 Current system constraint

Current events schema/API does **not** expose first-class `external_source` / `external_id` columns or dedicated upsert endpoint.

Therefore idempotency must be implemented by importer orchestration using existing fields and endpoints.

## 2.2 Canonical importer key

Define a canonical key:
- `import_key = "<external_source>:<external_id>"`

`external_source` and `external_id` are required importer-side inputs.

## 2.3 Required importer persistence

Importer must persist mapping in its own storage:
- `external_source`
- `external_id`
- `event_id` (UUID returned by API)
- `event_slug` (optional, for diagnostics)
- last imported checksum/version

This mapping is the primary idempotency anchor.

## 2.4 Metadata embedding requirement (for auditability)

When creating/updating events, importer must include these values in `descriptionJson`, for example:

```json
{
  "importMeta": {
    "external_source": "my_feed",
    "external_id": "abc-123"
  }
}
```

This does not create server-side uniqueness, but preserves traceability in event payload.

## 2.5 Idempotent flow using existing endpoints

1. Build `import_key`.
2. Check importer mapping store:
   - if found `event_id` -> `PATCH /events/:id` (update path).
   - if not found -> create path.
3. Create path:
   - optional: pre-lookup candidate via `GET /admin/events?q=<title fragment>&status=draft` and `GET /admin/events?q=<title fragment>&status=published` to reduce accidental duplicates.
   - call `POST /events`.
   - persist returned `event_id` in importer mapping store.
4. Publish step:
   - call `POST /events/:id/publish` only after successful create/update.
5. Retries:
   - if create succeeded but importer crashed before mapping save, first run admin lookup by title and review candidates manually or with conservative matching rules.
   - because current list endpoints do not expose `external_source`/`external_id` and there is no importer upsert endpoint, automatic crash-recovery dedupe is best-effort only.

Note: strict idempotency across crashes cannot be guaranteed by server alone in current API.

## 3) Location Handling Contract

Events reference location via `locationId` only.

### 3.1 Create/resolve location

Endpoint: `POST /admin/locations`

Request body:

```json
{
  "label": "Venue name (optional)",
  "formattedAddress": "Required formatted address",
  "countryCode": "optional",
  "city": "optional",
  "lat": 44.7866,
  "lng": 20.4489
}
```

Validation:
- `formattedAddress`: required, min length 3
- `lat`: required, `-90..90`
- `lng`: required, `-180..180`
- `label/countryCode/city`: optional

Response: created location object with `id`.

### 3.2 Attach location to event

Include `locationId` in `POST /events` or `PATCH /events/:id`.

Rules:
- `locationId: "<uuid>"` attaches/updates default location
- `locationId: null` removes default location
- omitted `locationId` on patch leaves location unchanged

## 4) Create Single Event Contract

Endpoint: `POST /events`

Required fields for single event:
- `title` (string, 1..250)
- `attendanceMode` (`in_person` | `online` | `hybrid`)
- `practiceCategoryId` (uuid)
- `scheduleKind` = `single`
- `eventTimezone` (string)
- `singleStartAt` (ISO datetime with timezone, string)
- `singleEndAt` (ISO datetime with timezone, string)

Optional fields:
- `descriptionJson` (object; default `{}`)
- `coverImagePath` (string|null)
- `externalUrl` (valid URL|null)
- `onlineUrl` (valid URL|null)
- `practiceSubcategoryId` (uuid|null)
- `tags` (string[])
- `languages` (string[])
- `visibility` (`public` | `unlisted`, default `public`)
- `locationId` (uuid|null)
- `organizerRoles` (array of `{ organizerId, roleId, displayOrder }`)

Single-schedule constraint (enforced):
- for `scheduleKind = "single"`:
  - `singleStartAt` and `singleEndAt` must be provided
  - recurring fields (`rrule`, `rruleDtstartLocal`, `durationMinutes`) must be absent/null

Minimal valid example:

```json
{
  "title": "Ecstatic Dance Friday",
  "descriptionJson": {
    "importMeta": {
      "external_source": "partner_feed",
      "external_id": "evt-1001"
    }
  },
  "attendanceMode": "in_person",
  "practiceCategoryId": "11111111-1111-1111-1111-111111111111",
  "scheduleKind": "single",
  "eventTimezone": "Europe/Belgrade",
  "singleStartAt": "2026-03-20T19:00:00+01:00",
  "singleEndAt": "2026-03-20T21:00:00+01:00",
  "visibility": "public",
  "locationId": "22222222-2222-2222-2222-222222222222",
  "tags": ["ecstatic"],
  "languages": ["en"],
  "organizerRoles": []
}
```

## 5) Update Contract

Endpoint: `PATCH /events/:id`

- Partial payload accepted (same field names as create plus optional `status`)
- Use this for idempotent re-import updates once mapping has `event_id`
- Keep `scheduleKind = "single"` data consistent when updating schedule fields

## 6) Publish Contract

Endpoint: `POST /events/:id/publish`

Response:

```json
{ "ok": true }
```

Behavior:
- event status transitions to `published`
- occurrences are generated for the event
- search index update is triggered

## 7) Recommended Import Sequence (Single Event)

1. Resolve taxonomy/organizer references (category UUID, optional organizer role IDs).
2. Create location via `POST /admin/locations` (or decide no location).
3. Build create/update payload with `descriptionJson.importMeta` containing `external_source` + `external_id`.
4. If mapping exists -> `PATCH /events/:id`; else `POST /events` and persist mapping.
5. `POST /events/:id/publish`.
6. Optional verification:
   - `GET /events/:slug` should return published event.

## 8) Non-Goals / Explicit Limits

- No server-side uniqueness on `external_source + external_id` currently.
- No dedicated importer endpoint or transactional upsert endpoint.
- No new endpoints introduced by this contract.
