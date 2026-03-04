# Runbook

## Services
- Postgres + PostGIS
- Meilisearch
- API (Fastify)
- Web (Next.js)

## Blue/Green Deployment (Zero-Downtime + Fast Rollback)

### Architecture
- Shared singleton services:
  - `postgres`
  - `meilisearch`
- Two application colors:
  - `blue`: `api_blue` (`:13001`), `web_blue` (`:13000`)
  - `green`: `api_green` (`:13101`), `web_green` (`:13100`)
- Apache routes traffic via active include files:
  - `/etc/apache2/sites-available/includes/dr_events_api_active.conf`
  - `/etc/apache2/sites-available/includes/dr_events_web_active.conf`

### Compose files
- Shared infra: `deploy/docker/docker-compose.base.yml`
- Blue stack: `deploy/docker/docker-compose.blue.yml`
- Green stack: `deploy/docker/docker-compose.green.yml`

### First-time setup on server
1. Install updated Apache vhost config from:
   - `deploy/apache/beta.events.danceresource.org.conf`
2. Initialize active includes (defaults to blue):
   - `npm run bg:init:apache`
   - Optional explicit color: `npm run bg:init:apache -- green`
3. Validate Apache:
   - `apachectl configtest`
   - `systemctl reload apache2` (or `apachectl graceful`)

### Standard deploy (build inactive color, then switch)
1. Preflight:
   - `npm run release:gate`
2. Deploy:
   - `npm run bg:deploy -- main`
3. Verify:
   - `npm run bg:active`
   - `curl -fsS https://beta.events.danceresource.org/api/health`
   - `curl -fsSI https://beta.events.danceresource.org/events`
   - `curl -fsSI https://beta.events.danceresource.org/sitemap.xml`

### Rollback (one command)
- `npm run bg:rollback`
- Then verify:
  - `npm run bg:active`
  - `curl -fsS https://beta.events.danceresource.org/api/health`

### Cleanup old color after observation window
- Stop old color stack only after release is stable:
  - `npm run bg:cleanup -- blue`
  - or
  - `npm run bg:cleanup -- green`

### Scripts
- `scripts/bg-active-color.sh`
- `scripts/bg-switch.sh <blue|green>`
- `scripts/bg-deploy.sh [git_ref]`
- `scripts/bg-rollback.sh`
- `scripts/bg-cleanup.sh <blue|green>`
- `scripts/bg-init-apache.sh [blue|green]`

### Migration policy for rollback safety
- Use expand/contract migrations only in blue/green deploys.
- Run migrations while inactive color is up, before switch.
- Avoid destructive schema contractions in the same release as a traffic switch.

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

## Map Clusters
- Public endpoint: `GET /api/map/clusters`
- Required params: `bbox`, `zoom`
- Default window: `from=now`, `to=now+90d`
- Map endpoint is geo-only (occurrences without coordinates are excluded).
- Server applies row cap (`5000`) before clustering; response includes `truncated=true` when cap is hit.
- Cache:
  - In-memory LRU
  - TTL `30s`
  - key includes normalized filters, rounded bbox, zoom, and date window

## User Alerts Skeleton (No delivery worker yet)
- Profile endpoints:
  - `GET /api/profile/alerts`
  - `POST /api/profile/alerts`
  - `DELETE /api/profile/alerts/:id`
- Admin dry-run endpoint:
  - `GET /api/admin/alerts/run-dry`
