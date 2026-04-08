# Events Platform

A fullstack TypeScript monorepo for event discovery and publishing, built for the [DanceResource](https://danceresource.org) community.

**Production:** [events.danceresource.org](https://events.danceresource.org)

## Features

- **Faceted search** with Meilisearch: filter by practice, format, tags, languages, attendance mode, location, date
- **Interactive map** with server-side clustering (Supercluster), spiderfy, geo-radius "near me" filter
- **Recurring events** via RRule with materialized occurrences (30-day look-back, 365-day forward)
- **Multi-host support** with roles (teacher, DJ, organizer) and multiple locations per host (PostGIS)
- **Keycloak SSO** with OIDC/PKCE, role-based access (admin, editor)
- **35 languages** with ICU message catalogs
- **Zero-downtime deployment** via blue/green switching with instant rollback
- **Dark mode** with OS preference detection

## Architecture

```
apps/api/          Fastify 5 backend (REST API, raw SQL + Zod)
apps/web/          Next.js 14 App Router frontend
packages/shared/   Zod schemas, role constants, shared types
db/migrations/     30 sequential SQL migrations
deploy/docker/     Docker Compose (dev + blue/green)
deploy/apache/     Apache vhost configs
scripts/           Deployment, maintenance, and data scripts
docs/              API contracts, runbook, architecture decisions
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Leaflet, TipTap, keycloak-js |
| Backend | Fastify 5, PostgreSQL 16 + PostGIS, Meilisearch 1.12 |
| Auth | Keycloak OIDC/PKCE, JWT via JWKS (jose) |
| Validation | Zod (shared between API and frontend) |
| Infrastructure | Docker Compose, Apache reverse proxy, Let's Encrypt |

### Data Model

- `events` &rarr; `event_occurrences` (materialized, refreshed nightly)
- `organizers` &rarr; `organizer_locations` (PostGIS geography points)
- `event_organizers` &mdash; many-to-many with display order and roles
- `practices` &mdash; 2-level category hierarchy (category / subcategory)
- `event_formats` &mdash; modality types (class, workshop, performance, etc.)
- `users` &mdash; linked to Keycloak via `keycloak_sub`
- External imports identified by `(externalSource, externalId)` unique pair

## Getting Started

### Prerequisites

- Node.js >= 20
- Docker and Docker Compose

### Setup

```bash
# Clone and install
git clone <repo-url> && cd events
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Keycloak realm, keys, etc.

# Start all services (postgres, meilisearch, api, web)
docker compose -f deploy/docker/docker-compose.yml up --build
```

**Default ports:**

| Service | Port |
|---------|------|
| PostgreSQL | 15432 |
| Meilisearch | 17700 |
| API | 13001 |
| Web | 13000 |

### Database

```bash
npm run migrate           # Run SQL migrations
npm run seed              # Seed initial data
npm run occurrences:refresh  # Generate recurring event occurrences
```

### Development

```bash
npm run dev:api           # Start API with hot reload
npm run dev:web           # Start Next.js dev server
```

## Commands

### Build & Test

```bash
npm run build                          # Build all packages
npm run typecheck                      # TypeScript check (all packages)
npm run test                           # Vitest unit tests (API)
```

### Database & Search

```bash
npm run migrate                        # Run pending migrations
npm run seed                           # Seed database
npm run occurrences:refresh            # Refresh recurring event horizon
npm run occurrences:reindex:all        # Full Meilisearch reindex
npm run meili:backup                   # Backup search index
```

### Deployment

```bash
npm run release:gate                   # Pre-deploy checks
npm run bg:deploy -- main              # Full blue/green deploy (~210s)
bash scripts/quick-deploy-web.sh       # Web-only quick deploy (~110s)
npm run bg:active                      # Check active color
npm run bg:rollback                    # Instant rollback
npm run bg:cleanup -- blue             # Stop old color
```

**Blue/green architecture:** PostgreSQL and Meilisearch are shared. Blue (`api:13001`, `web:13000`) and green (`api:13101`, `web:13100`) run simultaneously. Apache switches traffic via include files. Use `bg:deploy` for API/dependency changes, `quick-deploy-web.sh` for frontend-only changes.

## API

The API serves ~50 endpoints across these domains:

| Route Group | Prefix | Description |
|-------------|--------|-------------|
| Events | `/api/events` | Search, detail, CRUD |
| Organizers | `/api/organizers` | Host directory and profiles |
| Map | `/api/map` | Clustered GeoJSON (events + hosts) |
| Meta | `/api/meta` | Taxonomies, cities, tags autocomplete |
| Manage | `/api/manage` | Editor event/host management |
| Admin | `/api/admin` | Users, taxonomies, logs |
| Uploads | `/api/uploads` | Image upload and serving |
| Profile | `/api/profile` | User profile and alerts |
| Geocode | `/api/geocode` | Location search |
| Health | `/api/health` | Health check |

Full API contract: [`docs/api.md`](docs/api.md)

### Search Conventions

Multi-value filter params use CSV: `practiceCategoryId=uuid1,uuid2`. Responses include facet counts for building filter UIs. All request/response shapes validated with Zod.

## Auth & Roles

Keycloak OIDC with PKCE SPA flow. Frontend uses `keycloak-js`, backend validates Bearer JWTs via JWKS.

| Role | Permissions |
|------|------------|
| `admin` | Full platform management: users, taxonomies, all content |
| `editor` | Manage own events and hosts |
| (anonymous) | Browse, search, view details |

## Internationalization

35 languages supported via ICU message catalogs in `apps/web/i18n/messages/`. Default: English. Locale detection from browser preferences with manual override.

## Project Structure

```
apps/
  api/src/
    config.ts          Zod-validated env config
    index.ts           Fastify setup (CORS, multipart, rate limiting)
    routes/            One file per domain (14 route files)
    db/                Repository modules (raw SQL + Zod, 19 modules)
    services/          Business logic (14 services)
    middleware/        Auth guards
    scripts/           migrate, seed, refreshOccurrences
  web/
    app/               App Router pages (36 routes)
      events/          Event search + detail
      hosts/           Host directory + detail
      manage/          Editor area (events, hosts)
      manage/admin/    Admin panel
      auth/            Keycloak callback
      profile/         User profile
    components/        React components (admin forms, maps, layout)
    lib/               API client, hooks, utilities
    i18n/messages/     35 language catalogs
packages/
  shared/src/
    schemas/           Zod validation schemas (event, organizer)
    constants/         Role constants
    types/             Auth types
db/migrations/         30 SQL migrations
deploy/
  docker/              Compose files (dev, blue, green, base)
  apache/              Apache vhost configs
scripts/               Deploy, maintenance, data utilities
docs/                  API contracts, runbook, architecture decisions
```

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/api.md`](docs/api.md) | Complete API contract |
| [`docs/runbook.md`](docs/runbook.md) | Operations guide (deploy, migrations, SSO, cron) |
| [`docs/constitution.md`](docs/constitution.md) | MVP specification and product requirements |
| [`docs/decisions.md`](docs/decisions.md) | Architecture decision records |
| [`CLAUDE.md`](CLAUDE.md) | Developer guidance for AI-assisted development |

## Environment Variables

Key variables (see `.env.example` for full list):

| Variable | Description |
|----------|-------------|
| `MEILI_MASTER_KEY` | Meilisearch authentication key |
| `KEYCLOAK_ISSUER` | Keycloak realm issuer URL |
| `KEYCLOAK_JWKS_URL` | JWKS endpoint for JWT validation |
| `KEYCLOAK_AUDIENCE` | Expected JWT audience |
| `KEYCLOAK_REALM` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | OIDC client secret (optional for public clients) |
| `NEXT_PUBLIC_MAP_TILE_URL` | Map tile server URL |
| `RATE_LIMIT_ENABLED` | Enable API rate limiting |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | Max requests per window |
