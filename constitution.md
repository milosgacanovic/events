# DanceResource Events Platform (MVP) — Development Specification
Version: 0.1
Target domain: beta.events.danceresource.org
SSO: https://sso.danceresource.org (existing Keycloak)

## 1) Purpose and hard scope boundary

### 1.1 MVP goal
Build an open-source events discovery and publishing platform optimized for DanceResource:
- Public discovery: search + facets (with counts) + list (cards) + map (clustered)
- Structured metadata: practices (category/subcategory), tags, languages, modality, organizers
- Trusted publishing: editors/admins log in via Keycloak SSO and manage events/organizers
- Scales to 10k–100k event occurrences without rendering all markers

### 1.2 Explicit non-goals (NOT in MVP)
- Ticketing/payments
- RSVP / attendee lists / check-in
- Social features (groups, follows, feeds)
- ActivityPub federation (reserve later)
- Event ingestion/scraping pipelines (existing importer stays separate)

## 2) Product requirements

### 2.1 Public features
1) Events search page:
- List view (cards) and Map view toggle
- Filter sidebar on the right
- Facet counts shown per filter value (e.g., English (120), Ecstatic Dance (80))
- Sorting:
  - Default: soonest upcoming occurrence
  - Optional: newest published

2) Event detail page:
- Title, cover image, description
- Organizer(s) with role(s)
- Single or recurring schedule display
- Location map (if in-person/hybrid)
- Website/external URL
- Languages, tags, practice category/subcategory

3) Organizer directory + organizer detail page:
- Filter organizers by name, type, tags, languages, location
- Organizer detail shows profile + upcoming/past events

### 2.2 Editor/Admin features (SSO)
Editors can:
- Create/edit events and organizers
- Upload images
- Publish/unpublish
- Cancel events (keeps URL stable)
- Attach multiple organizers to an event with roles (teacher/dj/host/etc.)

Admins can:
- Manage taxonomies:
  - Practice categories + subcategories
  - Organizer roles/types
  - Optional: suggested tags list
- Configure UI label for “Category” to display as “Dance practices”
- Basic moderation: unpublish/archive

### 2.3 Internationalization (i18n) requirement
- All user-facing UI text must be translatable (public pages and admin pages).
- Use a standards-based i18n approach (BCP 47 locale codes + ICU-style message formatting).
- No hardcoded user-facing strings in UI components; strings must come from locale message catalogs.
- MVP must ship with at least two locales, with one default locale.

## 3) Architecture decisions (MVP)

### 3.1 Tech stack (recommended for fastest reliable MVP)
Monorepo (TypeScript):
- Web: Next.js (SSR capable, good SEO), React, TypeScript
- API: Node.js + Fastify (TypeScript) + Zod validation
- DB: PostgreSQL + PostGIS
- Search + facets: Meilisearch
- Map UI: Leaflet (raster tiles) + server-side clustering
- Clustering: supercluster (server-side)
- Auth: Keycloak OIDC, frontend obtains token, API validates JWT via JWKS
- Rich text: Editor.js (stores JSON), rendered on client or server

### 3.2 Why “occurrences” table is mandatory
If you support recurring events and allow filtering by date, you must query “occurrences”, not just “event series”.
MVP requirement:
- Store event series in events
- Materialize upcoming occurrences into event_occurrences for a rolling time horizon
- Search/map operate on event_occurrences
Default horizon:
- Generate occurrences from now - 30 days to now + 365 days
- Regenerate on publish/update of recurring schedules
- Nightly job to extend horizon for recurring events

### 3.3 Local file storage for MVP
No S3 in MVP.
- Store uploads on local disk inside docker volume mounted as ./data/uploads
- Serve via API under /uploads/*
- Future: swap to S3-compatible storage behind same interface

## 4) Repository layout (must be created)

- /apps
  - /web                 Next.js app
  - /api                 Fastify API
- /packages
  - /shared              shared types, zod schemas, constants
- /deploy
  - /apache              apache vhost configs
  - /docker              docker compose and env examples
- /db
  - /migrations          SQL migrations (or node-pg-migrate)
  - /seed                seed scripts
- /docs
  - api.md               endpoint contracts
  - runbook.md           operations notes
  - decisions.md         ADR notes
- AGENTS.md              instructions for Codex (commands, conventions)

## 5) Environments and domains

### 5.1 Base URLs
- Production-like beta:
  - Web: https://beta.events.danceresource.org
  - API: https://beta.events.danceresource.org/api
  - Uploads: https://beta.events.danceresource.org/uploads/...

### 5.2 Keycloak requirements (you must configure in Keycloak)
Create a Keycloak client for the web app (realm name is your choice; placeholders below):
- Client type: public (SPA) OR confidential (BFF). MVP uses public SPA.
- Redirect URIs:
  - https://beta.events.danceresource.org/*
- Web origins:
  - https://beta.events.danceresource.org
- Roles (realm roles or client roles):
  - dr_events_admin
  - dr_events_editor

API must accept Bearer JWT access tokens and map roles.

## 6) Dockerization requirements

### 6.1 Containers (docker compose)
Required services:
- postgres (with PostGIS)
- meilisearch
- api
- web
Optional (later): redis (caching), background worker separate process

Data volumes:
- postgres data: ./data/postgres
- meilisearch data: ./data/meili
- uploads: ./data/uploads (mounted into api and web if needed)

### 6.2 docker-compose.yml (must be created)
Use an indented block in this spec; Codex must create actual file.

  version: "3.9"
  services:
    postgres:
      image: postgis/postgis:16-3.4
      container_name: dr_events_postgres
      environment:
        POSTGRES_DB: dr_events
        POSTGRES_USER: dr_events
        POSTGRES_PASSWORD: dr_events_password
      ports:
        - "15432:5432"
      volumes:
        - ./data/postgres:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U dr_events -d dr_events"]
        interval: 10s
        timeout: 5s
        retries: 10

    meilisearch:
      image: getmeili/meilisearch:v1.12
      container_name: dr_events_meili
      environment:
        MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
        MEILI_NO_ANALYTICS: "true"
      ports:
        - "17700:7700"
      volumes:
        - ./data/meili:/meili_data

    api:
      build:
        context: .
        dockerfile: deploy/docker/api.Dockerfile
      container_name: dr_events_api
      environment:
        NODE_ENV: development
        PORT: 3001
        DATABASE_URL: postgresql://dr_events:dr_events_password@postgres:5432/dr_events
        MEILI_URL: http://meilisearch:7700
        MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
        UPLOADS_DIR: /app/uploads
        PUBLIC_BASE_URL: https://beta.events.danceresource.org
        KEYCLOAK_ISSUER: ${KEYCLOAK_ISSUER}
        KEYCLOAK_JWKS_URL: ${KEYCLOAK_JWKS_URL}
        KEYCLOAK_AUDIENCE: ${KEYCLOAK_AUDIENCE}
      depends_on:
        postgres:
          condition: service_healthy
        meilisearch:
          condition: service_started
      ports:
        - "13001:3001"
      volumes:
        - ./data/uploads:/app/uploads

    web:
      build:
        context: .
        dockerfile: deploy/docker/web.Dockerfile
      container_name: dr_events_web
      environment:
        NODE_ENV: development
        PORT: 3000
        NEXT_PUBLIC_API_BASE_URL: /api
        NEXT_PUBLIC_KEYCLOAK_URL: https://sso.danceresource.org
        NEXT_PUBLIC_KEYCLOAK_REALM: ${KEYCLOAK_REALM}
        NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID}
      depends_on:
        - api
      ports:
        - "13000:3000"

### 6.3 Dockerfiles (must be created)
- deploy/docker/api.Dockerfile
  - multi-stage: install deps, build TS, run node dist
- deploy/docker/web.Dockerfile
  - multi-stage: install deps, build Next.js, run next start

### 6.4 .env.example (must be created)
  MEILI_MASTER_KEY=change_me
  KEYCLOAK_ISSUER=https://sso.danceresource.org/realms/YOUR_REALM
  KEYCLOAK_JWKS_URL=https://sso.danceresource.org/realms/YOUR_REALM/protocol/openid-connect/certs
  KEYCLOAK_AUDIENCE=YOUR_CLIENT_ID_OR_AUDIENCE
  KEYCLOAK_REALM=YOUR_REALM
  KEYCLOAK_CLIENT_ID=YOUR_CLIENT_ID

## 7) Apache config (host reverse proxy)

### 7.1 Assumptions
- Apache runs on the host (not in docker)
- Docker exposes:
  - web on localhost:13000
  - api on localhost:13001
- TLS is handled by Apache (Let’s Encrypt or existing cert)
- Domain: beta.events.danceresource.org

### 7.2 Apache vhost file to create
Path: deploy/apache/beta.events.danceresource.org.conf

  <VirtualHost *:80>
    ServerName beta.events.danceresource.org
    RewriteEngine On
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
  </VirtualHost>

  <IfModule mod_ssl.c>
  <VirtualHost *:443>
    ServerName beta.events.danceresource.org

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/beta.events.danceresource.org/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/beta.events.danceresource.org/privkey.pem

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass /api http://127.0.0.1:13001/api retry=0 timeout=60
    ProxyPassReverse /api http://127.0.0.1:13001/api

    ProxyPass /uploads http://127.0.0.1:13001/uploads retry=0 timeout=60
    ProxyPassReverse /uploads http://127.0.0.1:13001/uploads

    ProxyPass / http://127.0.0.1:13000/ retry=0 timeout=60
    ProxyPassReverse / http://127.0.0.1:13000/

    ErrorLog ${APACHE_LOG_DIR}/beta.events.danceresource.org-error.log
    CustomLog ${APACHE_LOG_DIR}/beta.events.danceresource.org-access.log combined
  </VirtualHost>
  </IfModule>

Notes:
- Enable Apache modules: proxy, proxy_http, ssl, headers, rewrite
- If your cert path differs, change it.

## 8) Data model (Postgres + PostGIS)

### 8.1 Conventions
- Primary keys: UUID (gen_random_uuid())
- Soft lifecycle: status fields (do not delete records in MVP)
- Time:
  - Store start/end in UTC for occurrences
  - Store event_timezone as IANA zone string on event series
- Language tags: store as BCP47 strings (validate format)

### 8.2 Tables (must be implemented)

#### 8.2.1 users
- id uuid pk
- keycloak_sub text unique not null
- created_at timestamptz not null default now()

#### 8.2.2 organizers
- id uuid pk
- slug text unique not null
- name text not null
- description_json jsonb not null default empty object
- website_url text null
- tags text[] not null default empty array
- languages text[] not null default empty array
- avatar_path text null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
- status text not null default 'published'  (published|draft|archived)

#### 8.2.3 organizer_roles (taxonomy)
Configurable roles/types used when attaching organizers to events
- id uuid pk
- key text unique not null (e.g., teacher, dj, organizer, host)
- label text not null
- sort_order int not null default 0
- is_active boolean not null default true

#### 8.2.4 organizer_locations
Organizers can have multiple base locations
- id uuid pk
- organizer_id uuid fk organizers(id) on delete cascade
- label text null
- formatted_address text null
- country_code text null
- city text null
- geom geography(Point, 4326) null
- created_at timestamptz not null default now()

Index:
- gist index on geom

#### 8.2.5 practices (taxonomy)
Practice categories and subcategories (two-level)
- id uuid pk
- parent_id uuid null fk practices(id) on delete cascade
- level int not null (1=category, 2=subcategory)
- key text unique not null
- label text not null
- sort_order int not null default 0
- is_active boolean not null default true

Constraint:
- parent_id must be null for level=1
- parent_id must be non-null for level=2

#### 8.2.6 events (event series)
- id uuid pk
- slug text unique not null
- title text not null
- description_json jsonb not null default empty object
- cover_image_path text null
- external_url text null
- attendance_mode text not null  (in_person|online|hybrid)
- online_url text null
- practice_category_id uuid not null fk practices(id)
- practice_subcategory_id uuid null fk practices(id)
- tags text[] not null default empty array
- languages text[] not null default empty array
- schedule_kind text not null (single|recurring)
- event_timezone text not null  (IANA tz string)
- single_start_at timestamptz null
- single_end_at timestamptz null
- rrule text null
- rrule_dtstart_local timestamptz null
- duration_minutes int null
- status text not null default 'draft'  (draft|published|cancelled|archived)
- visibility text not null default 'public' (public|unlisted)
- created_by_user_id uuid null fk users(id)
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
- published_at timestamptz null

Constraints:
- If schedule_kind=single: single_start_at and single_end_at required, rrule null
- If schedule_kind=recurring: rrule, rrule_dtstart_local, duration_minutes required

#### 8.2.7 locations
Reusable locations for in-person/hybrid events
- id uuid pk
- label text null
- formatted_address text not null
- country_code text null
- city text null
- geom geography(Point, 4326) not null
- created_at timestamptz not null default now()

Index:
- gist index on geom

#### 8.2.8 event_locations (series-level default location)
- event_id uuid pk fk events(id) on delete cascade
- location_id uuid not null fk locations(id)

#### 8.2.9 event_organizers (many-to-many)
- event_id uuid fk events(id) on delete cascade
- organizer_id uuid fk organizers(id) on delete cascade
- role_id uuid fk organizer_roles(id)
- display_order int not null default 0
Primary key: (event_id, organizer_id, role_id)

#### 8.2.10 event_occurrences (materialized upcoming occurrences)
Search and map operate on this table.
- id uuid pk
- event_id uuid not null fk events(id) on delete cascade
- starts_at_utc timestamptz not null
- ends_at_utc timestamptz not null
- status text not null default 'published'  (published|cancelled)
- location_id uuid null fk locations(id)
- country_code text null
- city text null
- geom geography(Point, 4326) null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Indexes:
- btree on starts_at_utc
- btree on ends_at_utc
- gist on geom
- btree on event_id

#### 8.2.11 geocode_cache
Caches external geocoding lookups to reduce requests and respect rate limits.
- id uuid pk
- query text not null
- provider text not null default 'nominatim'
- response jsonb not null
- created_at timestamptz not null default now()
Unique: (provider, query)

### 8.3 Migration and seed requirements
- Enable extensions:
  - pgcrypto (for gen_random_uuid)
  - postgis
- Seed required taxonomies:
  - organizer_roles: teacher, dj, organizer, host
  - practices: a minimal initial set (can be edited later)
- Create admin UI config table (optional) OR store config in env for MVP
  - At minimum, web must display label “Dance practices” for practice_category_id

## 9) Occurrence generation (recurring schedules)

### 9.1 Rules
- For single events:
  - Create exactly one event_occurrence on publish/update
- For recurring events:
  - Use rrule + dtstart_local + duration_minutes + event_timezone
  - Generate occurrences into event_occurrences for horizon window:
    - from: now - 30 days
    - to: now + 365 days
  - On publish/update:
    - delete existing occurrences for the event in that window
    - regenerate
  - Nightly maintenance endpoint/cron:
    - extend for all recurring events to keep “to = now + 365 days”

### 9.2 Libraries
- Use a stable RRULE library in Node (rrule)
- Time zone conversions must use IANA zones (luxon recommended)

## 10) Search and facets (Meilisearch)

### 10.1 Index strategy
Primary index: event_occurrences
Document id: occurrence id
Include embedded event + organizer snippets to avoid N+1 reads in search results.

Fields to include (minimum):
- occurrence_id
- event_id
- event_slug
- title
- description_text (plain text extracted from Editor.js JSON)
- starts_at_utc, ends_at_utc
- attendance_mode
- practice_category_id, practice_subcategory_id
- tags
- languages
- organizer_ids
- organizer_names
- country_code, city
- geo (lat, lng) when available

Filterable attributes (must be configured in Meilisearch):
- starts_at_utc (as range filter)
- practice_category_id
- practice_subcategory_id
- tags
- languages
- attendance_mode
- organizer_ids
- country_code
- city
- has_geo (boolean)

Sortable attributes:
- starts_at_utc
- published_at (optional)

Facets requested by UI:
- practice_category_id
- practice_subcategory_id
- languages
- attendance_mode
- country_code
- organizer_ids (optional if performance OK)
- tags (optional if performance OK)

### 10.2 Sync requirements
When any of the following changes, reindex affected occurrences:
- event published/unpublished/cancelled/archived
- schedule changes
- taxonomy/tags/languages changes
- organizer attachments change
- location changes

MVP sync method:
- Perform DB write
- Regenerate occurrences (if needed)
- Upsert occurrences into Meilisearch
This is synchronous in MVP; later split into background worker.

## 11) Map clustering

### 11.1 Map endpoint behavior
Map view must not return 10k markers raw.
Implement server endpoint that returns clusters for:
- a filter set
- a bounding box
- a zoom level

### 11.2 Implementation approach (MVP)
Endpoint queries DB for matching occurrences that:
- are within date window
- match filters
- have geom within bbox
Then:
- Convert to GeoJSON points
- Run supercluster to get clusters for zoom
- Return clusters as GeoJSON FeatureCollection with:
  - cluster=true/false
  - point_count for clusters
  - occurrence_id for leaf points

Caching:
- In-memory LRU cache keyed by hash(filters + bbox + zoom + date_window)
- TTL 30 seconds (enough for UI panning)

## 12) API specification (REST)

Base path: /api

### 12.1 Public endpoints

GET /api/health
Response: 200 ok with db and meili status

GET /api/events/search
Query params:
- q (string)
- from (ISO datetime, optional; default now)
- to (ISO datetime, optional; default now+90d)
- practiceCategoryId (uuid, optional)
- practiceSubcategoryId (uuid, optional)
- tags (comma list, optional)
- languages (comma list, optional)
- attendanceMode (in_person|online|hybrid, optional)
- organizerId (uuid, optional)
- countryCode (string, optional)
- city (string, optional)
- hasGeo (true|false, optional)
- page (int, default 1)
- pageSize (int, default 20, max 50)
- sort (startsAtAsc|startsAtDesc, default startsAtAsc)

Response shape:
- hits: array of occurrence cards:
  - occurrenceId, startsAtUtc, endsAtUtc
  - event: id, slug, title, coverImageUrl, attendanceMode, languages, tags, practice ids
  - location: formatted_address, city, country_code, lat, lng (optional)
  - organizers: array { id, name, avatarUrl, roles[] }
- totalHits
- facets:
  - practiceCategoryId: map id -> count
  - practiceSubcategoryId: map id -> count
  - languages: map code -> count
  - attendanceMode: map value -> count
  - countryCode: map code -> count
  - tags: map tag -> count (optional)
  - organizerId: map id -> count (optional)
- pagination: page, pageSize, totalPages

GET /api/events/:slug
Returns event series with:
- event fields
- organizers with roles
- default location (if any)
- occurrences preview:
  - next 10 upcoming
  - last 5 past (optional)

GET /api/organizers/search
Query params:
- q
- tags
- languages
- roleKey (teacher|dj|organizer|host)
- countryCode
- city
- page, pageSize
Response includes facet counts at least for roleKey, languages, countryCode

GET /api/organizers/:slug
Returns organizer profile + upcoming occurrences (next 20)

GET /api/map/clusters
Query params:
- from, to (same defaults as search)
- filters (same as /events/search)
- bbox (west,south,east,north)
- zoom (int 0..20)
Response: GeoJSON FeatureCollection of clusters + points

GET /api/uploads/:path
Static file serving (implemented by API)

GET /api/geocode/search
Query params:
- q (string)
- limit (int, default 8, max 10)
Response:
- array of results: { formatted_address, lat, lng, country_code, city, raw }

### 12.2 Auth endpoints (frontend-driven OIDC)
No custom login endpoints required in MVP.
Frontend obtains token from Keycloak; API verifies JWT.

### 12.3 Editor/Admin endpoints (require Bearer token)

POST /api/admin/practices
PATCH /api/admin/practices/:id
POST /api/admin/organizer-roles
PATCH /api/admin/organizer-roles/:id
Access: admin only

POST /api/organizers
PATCH /api/organizers/:id
Access: editor/admin

POST /api/events
PATCH /api/events/:id
POST /api/events/:id/publish
POST /api/events/:id/unpublish
POST /api/events/:id/cancel
Access: editor/admin
Rules:
- publish creates/updates occurrences + indexes search

POST /api/uploads
Multipart form:
- file
- kind (eventCover|organizerAvatar)
- entityId
Access: editor/admin
Response:
- url (public path under /uploads)
- stored_path

## 13) Authorization (RBAC)

### 13.1 Token verification
API must:
- Fetch and cache JWKS from KEYCLOAK_JWKS_URL
- Verify JWT signature, issuer, audience
- Extract roles (realm_access.roles or resource_access)
- Map to:
  - isAdmin if role dr_events_admin
  - isEditor if role dr_events_editor or isAdmin

### 13.2 Permissions
- Public endpoints: only published events/organizers
- Editors:
  - create/edit their content (MVP: any editor can edit; ownership rules later)
- Admins:
  - everything + taxonomy management

## 14) Upload handling (local storage)

### 14.1 Constraints
- Max file size: 5 MB (configurable)
- Allowed MIME: image/jpeg, image/png, image/webp
- Store under:
  - /app/uploads/events/<eventId>/cover.<ext>
  - /app/uploads/organizers/<organizerId>/avatar.<ext>
- Return public URL:
  - https://beta.events.danceresource.org/uploads/...

### 14.2 Security
- Validate MIME using content sniffing (not just extension)
- Randomize filenames or strictly control paths to avoid traversal
- Set Cache-Control:
  - immutable for versioned files OR 1 day for MVP

## 15) Web UI specification (Next.js)

### 15.1 Pages
- /events
  - search input
  - filter sidebar with facet counts
  - list/map toggle
  - list: cards
  - map: leaflet map + clustered markers from /api/map/clusters
- /events/[slug]
  - event detail
  - occurrences list for recurring
- /organizers
  - organizer directory with filters
- /organizers/[slug]
  - organizer profile + upcoming events
- /admin
  - requires login
  - sections:
    - Events list + create/edit
    - Organizers list + create/edit
    - Taxonomies (admin only)

### 15.2 Editor UI behaviors
- Event form fields:
  - title
  - cover image upload
  - description (Editor.js)
  - practice category/subcategory
  - tags input (comma)
  - attendance mode + online url
  - languages multi-select
  - schedule:
    - single: start/end + timezone
    - recurring: UI builder -> rrule string, dtstart local, duration
  - location:
    - address autocomplete using /api/geocode/search
    - save as location_id
  - organizers:
    - multi-select existing organizers
    - assign role(s) per organizer
- Autosave draft every 10 seconds (optional)
- Publish/unpublish buttons

### 15.3 Map tiles
MVP uses a configurable tile URL:
- NEXT_PUBLIC_MAP_TILE_URL default: https://tile.openstreetmap.org/{z}/{x}/{y}.png
Add visible attribution control.
Important: public OSM tiles have usage limits; for real traffic move to paid tiles or self-host.

## 16) Data sanitation and rendering

### 16.1 Editor.js storage
Store description_json as JSONB.
Also compute description_text (plain text) for Meilisearch.

Rendering:
- Web renders JSON -> HTML using a safe renderer
- Do not store raw HTML in DB in MVP

### 16.2 Slug generation
- Slugs are required for events and organizers.
- Generate slug from title/name, normalize, ensure uniqueness by suffixing -2, -3, etc.

## 17) Operational requirements

### 17.1 Health and readiness
- /api/health returns:
  - db ok
  - meili ok
  - version

### 17.2 Logging
- Structured logs (json) from API
- Request id middleware

### 17.3 Cron / scheduled job (MVP)
Provide a script command in API:
- npm run occurrences:refresh
It:
- extends recurring occurrences to now+365 days
- cleans old occurrences older than now-30 days (optional)
This can be run by host cron calling docker exec.

## 18) Testing requirements

### 18.1 API tests
- Unit tests:
  - rrule parsing and occurrence generation
  - auth role extraction
- Integration tests (docker required):
  - event publish generates occurrences
  - meili indexing called and documents appear

### 18.2 Web tests (minimal)
- Smoke test: /events renders and can query API

## 19) AGENTS.md (Codex instructions)
Codex must add AGENTS.md with:
- How to start dev: docker compose up, then open localhost:13000
- How to run tests
- How to run migrations + seed
- Conventions:
  - no direct SQL in controllers; use db layer
  - zod for request validation
  - keep API response contracts stable (docs/api.md)

## 20) Implementation plan (Codex task breakdown)

### Epic A — Bootstrap
- Create monorepo structure
- Configure pnpm (or npm workspaces)
- Add docker compose + Dockerfiles
- Add .env.example
- Add Apache config file

Acceptance:
- docker compose up starts postgres, meili, api, web
- /api/health returns ok
- web home loads

### Epic B — Database schema + migrations
- Create extensions (pgcrypto, postgis)
- Create all tables + indexes + constraints
- Seed taxonomies

Acceptance:
- migrations run clean
- seed adds minimum taxonomy rows

### Epic C — Auth middleware (Keycloak)
- JWT validation via JWKS
- RBAC helpers: requireEditor, requireAdmin
- Protect editor/admin endpoints

Acceptance:
- editor endpoint returns 401 without token
- returns 403 without role
- returns 200 with role

### Epic D — Organizer CRUD
- Create/edit organizer
- Upload avatar
- Organizer search (basic DB first)
- Organizer detail + upcoming occurrences

Acceptance:
- organizer created and visible publicly when published

### Epic E — Event CRUD + occurrence generation
- Create/edit event series
- Publish/unpublish/cancel
- Occurrence generation for:
  - single
  - recurring via rrule
- Store event default location via geocode

Acceptance:
- publishing single creates 1 occurrence
- publishing recurring creates N occurrences in horizon
- cancelling updates status and remains visible as cancelled on detail

### Epic F — Search + facets (Meilisearch)
- Implement indexing pipeline (synchronous MVP)
- Implement /events/search returning facets + cards
- Implement /organizers/search facets

Acceptance:
- facet counts match filters
- pagination works

### Epic G — Map clusters
- Implement /map/clusters using supercluster
- Web map view renders clusters and expands on zoom

Acceptance:
- world view doesn’t render 10k markers individually
- zooming and filtering updates clusters

### Epic H — Admin taxonomies
- CRUD for practices and organizer_roles
- UI label “Dance practices”

Acceptance:
- new category appears in filters and editor

## 21) Deliverables that Codex must create (minimum file list)

- deploy/docker/api.Dockerfile
- deploy/docker/web.Dockerfile
- deploy/docker/docker-compose.yml
- deploy/apache/beta.events.danceresource.org.conf
- .env.example
- AGENTS.md
- docs/api.md
- apps/api (source)
- apps/web (source)
- db/migrations (source)
- db/seed (source)

## 22) Definition of done (MVP)
MVP is done when:
1) Public search shows events with filters and facet counts
2) Map view clusters events and respects filters
3) Editor logs in via Keycloak and can:
   - create organizer
   - create event (single or recurring)
   - publish and see it publicly
4) Admin can edit practices taxonomy and organizer roles
5) All runs fully in docker with host Apache reverse proxy for beta.events.danceresource.org
