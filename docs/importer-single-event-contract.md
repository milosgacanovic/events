# Importer Contract: Single Event Create + Publish

Base URL: `https://beta.events.danceresource.org/api`

Scope:
- single events only
- `scheduleKind = "single"` only
- existing endpoints only

## 1) Auth (Client Credentials)

Importer uses OAuth2 client-credentials with Keycloak.

- Token endpoint pattern:
  - `https://sso.danceresource.org/realms/<REALM>/protocol/openid-connect/token`
- Grant:
  - `grant_type=client_credentials`
- API auth header:
  - `Authorization: Bearer <access_token>`
- Required role:
  - `dr_events_editor` (or `dr_events_admin`)
- Token lifecycle:
  - importer must request a new access token when current token is expired.

Protected importer endpoints:
- `POST /events`
- `PATCH /events/:id`
- `POST /events/:id/publish`
- `POST /admin/locations`
- `GET /admin/events`

## 2) Idempotency (Official Model)

Idempotency is first-class in events API.

Fields:
- `externalSource` (`string | null`, max 255)
- `externalId` (`string | null`, max 255)

Rules:
- both-or-none is enforced
- if one is provided, the other must be provided
- `PATCH /events/:id` can clear idempotency by sending both as `null`

Server-side uniqueness:
- unique pair on `(external_source, external_id)` when both are non-null

Duplicate conflict response (`409`):
```json
{
  "error": "external_ref_conflict",
  "externalSource": "...",
  "externalId": "..."
}
```

### Recovery flow

1. `POST /api/events` with `externalSource` + `externalId`.
2. If `201`: continue to publish.
3. If `409`: `GET /api/admin/events?externalSource=...&externalId=...&page=1&pageSize=20`.
4. `PATCH /api/events/:id` for updates if needed.
5. `POST /api/events/:id/publish`.

`descriptionJson.importMeta` is optional audit metadata only; it is not idempotency enforcement.

## 3) Location Handling

Event create/update uses `locationId` only.

Location must be resolved before event create/update:
- create/resolve location via `POST /admin/locations`
- use returned `locationId` in event payload

No inline location auto-creation is part of this contract.

Location behavior:
- set `locationId: "<uuid>"` on create/patch to attach or change location
- set `locationId: null` on patch to clear location
- omit `locationId` on patch to keep current location unchanged

## 4) Single Event Payload Contract

Endpoint: `POST /events`

Required for importer MVP:
- `title`
- `attendanceMode` (`in_person` | `online` | `hybrid`)
- `practiceCategoryId` (uuid)
- `scheduleKind` = `single`
- `eventTimezone`
- `singleStartAt` (ISO datetime)
- `singleEndAt` (ISO datetime)

Idempotency fields for importer:
- `externalSource`
- `externalId`

Single-event shape rule:
- `singleStartAt` + `singleEndAt` are required
- recurring fields (`rrule`, `rruleDtstartLocal`, `durationMinutes`) must not be used for importer MVP

## 5) Publish

Endpoint: `POST /events/:id/publish`

Response:
```json
{ "ok": true }
```
