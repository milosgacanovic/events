# Runbook

## Services
- Postgres + PostGIS
- Meilisearch
- API (Fastify)
- Web (Next.js)

## I18n
- Web UI uses ICU message catalogs with `intl-messageformat`.
- Supported locales: `en` (default), `sr-Latn`.
- Locale selection is stored in cookie `dr_locale` and can also be inferred from `Accept-Language`.

## Health
- API: `/api/health`

## Keycloak SSO
- Web uses Keycloak JS (SPA + PKCE), so the Keycloak client should be configured as `public`.
- Keycloak client settings must be:
  - `Client authentication`: `Off` (public client)
  - `Standard flow`: enabled
  - `Valid redirect URIs`: include `https://beta.events.danceresource.org/auth/keycloak/callback` and `https://beta.events.danceresource.org/silent-check-sso.html` (or `https://beta.events.danceresource.org/*`)
  - `Web origins`: `https://beta.events.danceresource.org`
- Redirect URI used by login: `https://beta.events.danceresource.org/auth/keycloak/callback`
- Logout redirect URI: `https://beta.events.danceresource.org/admin`
- Silent SSO page: `https://beta.events.danceresource.org/silent-check-sso.html`
- Admin and callback routes inject Keycloak config from server runtime env (`KEYCLOAK_REALM`/`KEYCLOAK_CLIENT_ID` and `NEXT_PUBLIC_KEYCLOAK_*`), so stale client bundles do not lock SSO config.
- Required env values:
  - `KEYCLOAK_ISSUER=https://sso.danceresource.org/realms/<REALM>`
  - `KEYCLOAK_JWKS_URL=https://sso.danceresource.org/realms/<REALM>/protocol/openid-connect/certs`
  - `KEYCLOAK_AUDIENCE=<CLIENT_ID>` (optional; API also accepts `azp=<CLIENT_ID>` for Keycloak default access tokens)
  - `KEYCLOAK_REALM=<REALM>`
  - `KEYCLOAK_CLIENT_ID=<CLIENT_ID>`
  - Optional: `KEYCLOAK_CLIENT_SECRET` (not used by SPA login flow; only relevant for confidential-server flows)

## Cron
- Daily recurring horizon refresh:
  - `docker exec dr_events_api npm run occurrences:refresh`
