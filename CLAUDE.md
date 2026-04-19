# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DanceResource Events Platform — a fullstack TypeScript monorepo for event discovery and publishing. Features faceted search, map clustering, recurring event scheduling, Keycloak SSO, and zero-downtime blue/green deployment.

## Common Commands

```bash
# Development
cp .env.example .env
docker compose -f deploy/docker/docker-compose.yml up --build
# Services: postgres:15432, meilisearch:17700, api:13001, web:13000

# Tests & type checking
npm run test -w @dr-events/api          # Vitest unit tests
npm run typecheck -w @dr-events/api    # API typecheck
npm run typecheck -w @dr-events/web    # Web typecheck

# Database
npm run migrate -w @dr-events/api      # Run SQL migrations
npm run seed -w @dr-events/api         # Seed database
npm run occurrences:refresh -w @dr-events/api  # Refresh recurring event horizon

# Build
npm run build                          # Build all packages
```

## Blue/Green Deploy

> **Production URL**: `https://events.danceresource.org` — this is the live site. Deploy carefully.

```bash
npm run release:gate                   # Pre-deploy checks
npm run bg:deploy -- main              # Deploy to inactive color
npm run bg:active                      # Check active color
curl -fsS https://events.danceresource.org/api/health
npm run bg:rollback                    # Fast rollback if needed
npm run bg:cleanup -- blue             # Clean up old color after verification
```

Architecture: `postgres` + `meilisearch` are shared. Blue (`api:13001`, `web:13000`) and green (`api:13101`, `web:13100`) run simultaneously. Apache switches traffic via include files at `/etc/apache2/sites-available/includes/`.

### Quick Deploy (web-only, ~110s)

For frontend-only changes (CSS, HTML, JS) — skips Docker image rebuild:

```bash
bash scripts/quick-deploy-web.sh            # Auto-detects active color
bash scripts/quick-deploy-web.sh blue       # Target specific color
```

Builds Next.js locally, `docker cp`s the output into the running container, and restarts it. ~110s vs ~210s for full `bg:deploy`. Use `bg:deploy` for dependency or API changes.

## Architecture

### Monorepo Structure

```
apps/api/      Fastify 5 backend
apps/web/      Next.js 14 App Router frontend
packages/shared/  Zod schemas, role constants, shared types
db/migrations/ SQL migration files (run in order)
deploy/docker/ Docker Compose configs (dev + blue/green)
deploy/apache/ Apache vhost config
scripts/       Blue/green bash scripts
docs/          API contracts, runbook, architecture decisions
```

### API (`apps/api/src/`)

- `config.ts` — Zod-validated env config; fails fast on missing production vars
- `index.ts` — Fastify app setup (CORS, multipart, rate limiting, routes)
- `routes/` — One file per domain: `events`, `organizers`, `admin`, `adminContent`, `map`, `geocode`, `profile`, `uploads`, `meta`, `metrics`, `health`
- `db/` — Repository modules per domain (raw SQL + Zod); no ORM
- `services/` — `AuthService` (Keycloak JWT via jose+JWKS), `MeilisearchService`, `EventLifecycleService`, `MapClusterService` (Supercluster, 30s LRU cache), `OccurrenceService` (RRule expansion)
- `scripts/` — `migrate.ts`, `seed.ts`, `refreshOccurrences.ts`

### Web (`apps/web/`)

- `app/` — App Router pages: `events/`, `hosts/`, `admin/` (SSO-protected), `auth/`, `profile/`, `sitemap*`
- `components/admin/` — Editor forms for events and hosts
- `lib/api.ts` — Typed API client wrapper
- `i18n/messages/` — ICU message catalogs (35 locales, BCP-47 codes matching Keycloak realm)

### Data Model

- `events` → `event_occurrences` (materialized, 30d back–365d forward; refreshed nightly)
- `organizers` → `organizer_locations` (PostGIS geography points)
- `event_organizers` — Many-to-many join with display_order
- `practices` — 2-level category hierarchy
- `users` — Keycloak-linked (`keycloak_sub`)
- External imports identified by `(externalSource, externalId)` unique pair

### Search

Meilisearch indexes `event_occurrences`. Multi-value filter params use CSV: `practiceCategoryId=uuid1,uuid2`. Facets: practice, format, tags, languages, attendanceMode, organizerId, countryCode, city.

### Auth

Keycloak OIDC/PKCE SPA flow. Frontend: `keycloak-js`. Backend: Bearer JWT validated via JWKS. Roles: `dr_events_admin`, `dr_events_editor` (from `packages/shared/src/constants/roles.ts`).

## Temporary Files

The `temporary/` directory (gitignored) is for throwaway artifacts that should not be committed. Put files here when they are useful during a session but not part of the codebase:

- QA screenshots and test result outputs
- Ad-hoc test scripts (e.g. `test-*.mjs`)
- One-off debug logs or data dumps
- Intermediate audit/analysis docs that aren't final

Final docs (like QA audit reports or methodology guides) belong in `docs/`.

## Conventions

- No direct SQL in route handlers — use `db/` repository modules.
- Validate all request/response shapes with Zod.
- Never hardcode taxonomy IDs (categories, formats, roles) in code — always source from database via API payloads so the platform stays customizable.
- Keep API contracts in `docs/api.md` stable and up to date.
- Shared types/schemas live in `packages/shared/` and are imported by both api and web.
