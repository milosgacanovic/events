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

## Migrations
- Apply API migrations on server:
  - `npm run migrate -w @dr-events/api`
- Idempotency requires `003_event_external_ref.sql` (external reference columns + unique index).
- User alerts skeleton requires `014_user_alerts.sql`.
- Before any deploy, run release gate checks:
  - `npm run release:gate`
- If release gate fails only on Meili parity drift, run a hard reset reindex:
  - `npm run occurrences:reindex:all -- --hard`
  - then re-run `npm run release:gate`
- Run weekly Meili snapshot backup before major migrations:
  - `npm run meili:backup`

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

## Importer smoke check
- See `docs/import-smoke.md` for the client-credentials single-event import smoke procedure.

## SEO Rules
- Indexable event listing pages:
  - `/events`
  - `/events?practiceCategoryId=<id>` (page 1 only)
  - `/events?eventFormatId=<id>` (page 1 only)
- Other filtered query combinations should be `noindex,follow`.
- `/events/[slug]` should expose SSR metadata + JSON-LD.
- Sitemap is chunked:
  - `/sitemap.xml` (index)
  - `/sitemap-pages.xml`
  - `/sitemap-events-<n>.xml`
  - Chunk route backing: `/sitemap-events/[page]`

## Importer Backfills
- Event format backfill:
  - `./run.sh worker:once --dr-events-only --dr-events-backfill-format --dr-events-limit=2000`
- Host linking backfill:
  - `./run.sh worker:once --dr-events-only --dr-events-backfill-hosts --dr-events-limit=2000`

## Organizer Search Facets and Meta Endpoints
- Organizer facets are served by `/api/organizers/search`:
  - `roleKey`, `languages`, `tags`, `countryCode`, `city`
- Organizer autocomplete endpoints:
  - `/api/meta/organizer-cities`
  - `/api/meta/organizer-tags`

## User Alerts Skeleton (No delivery worker yet)
- Profile endpoints:
  - `GET /api/profile/alerts`
  - `POST /api/profile/alerts`
  - `DELETE /api/profile/alerts/:id`
- Admin dry-run endpoint:
  - `GET /api/admin/alerts/run-dry`
