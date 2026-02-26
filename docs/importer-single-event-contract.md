# Importer Contract: Single Event Create + Publish (Server-Enforced Idempotency)

This contract describes how to import and publish **single** events using the current API, with first-class server idempotency.

Base URL: `https://beta.events.danceresource.org/api`

Scope:
- single events only (`scheduleKind = "single"`)
- existing endpoints only (no new endpoints)
- strict to current API behavior

## 1) Auth and Roles

Required Bearer role for importer operations:
- `dr_events_editor` or `dr_events_admin`

Used endpoints:
- `POST /events`
- `PATCH /events/:id`
- `POST /events/:id/publish`
- `POST /admin/locations`
- `GET /admin/events` (lookup by external reference)

Common errors:
- `401` missing/invalid token
- `403` missing role
- `400` validation error
- `404` event not found on patch/publish
- `409` external reference conflict

## 2) First-Class Idempotency

## 2.1 External reference fields

Events support two optional fields:
- `externalSource`
- `externalId`

Constraints:
- max length 255 each
- if one is provided, both must be provided

Database uniqueness:
- unique on `(external_source, external_id)` when both are non-null

## 2.2 Official importer flow

1. Importer sends `POST /events` with `externalSource` + `externalId`.
2. If `201`, importer proceeds.
3. If `409` (`external_ref_conflict`), importer resolves canonical event via:
   - `GET /admin/events?externalSource=<...>&externalId=<...>&page=1&pageSize=20`
4. Importer patches resolved event:
   - `PATCH /events/:id`
5. Importer publishes:
   - `POST /events/:id/publish`

This is the official idempotent create/update contract.

## 2.3 `descriptionJson.importMeta`

`descriptionJson.importMeta` remains optional and audit-only.
It is not required for idempotency enforcement.

## 3) Location Handling

Events attach location by `locationId`.

### 3.1 Create location

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
- `formattedAddress` required, min length 3
- `lat` required, `-90..90`
- `lng` required, `-180..180`

### 3.2 Attach or clear location on event

- On create/patch, set `locationId: "<uuid>"` to attach/update
- On patch, set `locationId: null` to clear
- If patch omits `locationId`, existing event location is unchanged

## 4) Create Single Event Payload

Endpoint: `POST /events`

Required fields for `scheduleKind = "single"`:
- `title`
- `attendanceMode` (`in_person` | `online` | `hybrid`)
- `practiceCategoryId` (uuid)
- `scheduleKind` = `single`
- `eventTimezone`
- `singleStartAt` (ISO datetime)
- `singleEndAt` (ISO datetime)

Optional fields (common):
- `descriptionJson`
- `coverImagePath`
- `externalUrl`
- `onlineUrl`
- `practiceSubcategoryId`
- `tags`
- `languages`
- `visibility`
- `locationId`
- `organizerRoles`
- `externalSource`
- `externalId`

Pair rule for idempotency fields:
- both omitted: allowed
- both non-null: allowed
- both null: allowed (primarily for patch clear)
- only one provided: rejected with `400`

Single-schedule shape rule:
- requires `singleStartAt` + `singleEndAt`
- recurring fields (`rrule`, `rruleDtstartLocal`, `durationMinutes`) must be absent/null

Example:
```json
{
  "title": "Ecstatic Dance Friday",
  "descriptionJson": {
    "importMeta": {
      "source": "partner_feed",
      "id": "evt-1001"
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
  "organizerRoles": [],
  "externalSource": "partner_feed",
  "externalId": "evt-1001"
}
```

## 5) Conflict Contract (`409`)

Duplicate external reference on create/update returns:

```json
{
  "error": "external_ref_conflict",
  "externalSource": "partner_feed",
  "externalId": "evt-1001"
}
```

Importer should then lookup and patch existing event as described above.

## 6) Publish Contract

Endpoint: `POST /events/:id/publish`

Response:
```json
{ "ok": true }
```

Behavior unchanged:
- event status becomes `published`
- occurrences are generated
- search index is updated

## 7) Explicit Non-Goals

- No new importer endpoint
- No organizer endpoint rename
- No recurrence, search, or map behavior changes in this contract
