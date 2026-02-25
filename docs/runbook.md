# Runbook

## Services
- Postgres + PostGIS
- Meilisearch
- API (Fastify)
- Web (Next.js)

## Health
- API: `/api/health`

## Keycloak SSO
- Web uses Keycloak JS (SPA + PKCE), so the Keycloak client should be configured as `public`.
- Redirect URI used by login: `https://beta.events.danceresource.org/auth/keycloak/callback`
- Logout redirect URI: `https://beta.events.danceresource.org/admin`
- Silent SSO page: `https://beta.events.danceresource.org/silent-check-sso.html`
- Admin and callback routes inject Keycloak config from server runtime env (`KEYCLOAK_REALM`/`KEYCLOAK_CLIENT_ID` and `NEXT_PUBLIC_KEYCLOAK_*`), so stale client bundles do not lock SSO config.
- Required env values:
  - `KEYCLOAK_ISSUER=https://sso.danceresource.org/realms/<REALM>`
  - `KEYCLOAK_JWKS_URL=https://sso.danceresource.org/realms/<REALM>/protocol/openid-connect/certs`
  - `KEYCLOAK_AUDIENCE=<CLIENT_ID>`
  - `KEYCLOAK_REALM=<REALM>`
  - `KEYCLOAK_CLIENT_ID=<CLIENT_ID>`
  - Optional: `KEYCLOAK_CLIENT_SECRET` (not used by SPA login flow)

## Cron
- Daily recurring horizon refresh:
  - `docker exec dr_events_api npm run occurrences:refresh`
