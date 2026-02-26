# Import Smoke (Single Event, Client Credentials)

This smoke check validates real importer integration against existing APIs:
- client-credentials token works
- protected editor route is reachable with JWT + role
- single event create + publish works
- duplicate create returns `409 external_ref_conflict`
- admin lookup by `externalSource` + `externalId` resolves the event

## Prerequisites

- API is running and reachable.
- Migration `003_event_external_ref.sql` is applied:
  - `npm run migrate -w @dr-events/api`
- Seed data exists (at least one active category):
  - `npm run seed -w @dr-events/api`
- Keycloak importer client is configured for client credentials and has role:
  - `dr_events_editor` or `dr_events_admin`

## Run

```bash
IMPORT_SMOKE_BASE_URL=https://beta.events.danceresource.org \
IMPORT_SMOKE_CLIENT_ID=events-importer \
IMPORT_SMOKE_CLIENT_SECRET=YOUR_CLIENT_SECRET \
IMPORT_SMOKE_TOKEN_URL=https://sso.danceresource.org/realms/danceresource/protocol/openid-connect/token \
npm run import:smoke
```

Notes:
- If `IMPORT_SMOKE_TOKEN_URL` is omitted, script falls back to:
  - `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`

## Expected Output

Successful run logs:
- token acquired
- auth probe passed (`POST /api/events` invalid payload -> `400`)
- event created (`201`)
- event published (`200`)
- duplicate create returned `409`
- admin lookup resolved event id

## Reset / Cleanup

The smoke script uses fixed idempotency pair:
- `externalSource = "smoke_test"`
- `externalId = "evt-1"`

If you need to re-run from a clean first-create state:

1. Find the event:
   - `GET /api/admin/events?externalSource=smoke_test&externalId=evt-1&page=1&pageSize=20`
2. Clear external refs:
   - `PATCH /api/events/:id` with:

```json
{
  "externalSource": null,
  "externalId": null
}
```

Optional cleanup:
- `POST /api/events/:id/cancel`

## Troubleshooting

- `401` on auth probe:
  - invalid token, wrong issuer/JWKS/audience, or wrong token endpoint.
- `403` on auth probe:
  - service account missing editor/admin role.
- `500 auth_not_configured`:
  - API missing Keycloak env (`KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_CLIENT_ID`/`KEYCLOAK_AUDIENCE`).
- `409` on first create:
  - smoke event already exists with same external pair; reset as described above.
