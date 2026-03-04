# DanceResource Events Platform - Agent Notes

## Start development
- `cp .env.example .env`
- `docker compose -f deploy/docker/docker-compose.yml up --build`
- Open `http://localhost:13000`

## Tests
- API unit tests: `npm run test -w @dr-events/api`
- API typecheck: `npm run typecheck -w @dr-events/api`
- Web typecheck: `npm run typecheck -w @dr-events/web`

## Migrations and seed
- Run migrations: `npm run migrate -w @dr-events/api`
- Run seed: `npm run seed -w @dr-events/api`
- Refresh recurring horizon: `npm run occurrences:refresh -w @dr-events/api`

## Blue/Green deploy (beta)
- Architecture:
  - Shared services: `postgres`, `meilisearch`
  - Blue app stack: `api_blue` (`13001`), `web_blue` (`13000`)
  - Green app stack: `api_green` (`13101`), `web_green` (`13100`)
  - Apache switches active color via:
    - `/etc/apache2/sites-available/includes/dr_events_api_active.conf`
    - `/etc/apache2/sites-available/includes/dr_events_web_active.conf`
- First-time setup on host:
  - `npm run bg:init:apache` (or `npm run bg:init:apache -- green`)
- Standard deploy:
  - `npm run release:gate`
  - `npm run bg:deploy -- main`
  - `npm run bg:active`
  - `curl -fsS https://beta.events.danceresource.org/api/health`
- Fast rollback:
  - `npm run bg:rollback`
- Cleanup old color after verification:
  - `npm run bg:cleanup -- blue` or `npm run bg:cleanup -- green`
- Script entrypoints:
  - `scripts/bg-init-apache.sh`
  - `scripts/bg-active-color.sh`
  - `scripts/bg-switch.sh`
  - `scripts/bg-deploy.sh`
  - `scripts/bg-rollback.sh`
  - `scripts/bg-cleanup.sh`

## Live API verification (dev-only)
- Script: `npm run test:live:admin`
- Guard: script executes only when `RUN_LIVE_ADMIN_TEST=1` is set.
- Required env vars:
  - `DR_EVENTS_TEST_API_BASE`
  - `DR_EVENTS_TEST_TOKEN_URL`
  - `DR_EVENTS_TEST_CLIENT_ID`
  - `DR_EVENTS_TEST_CLIENT_SECRET`
- Optional filter env vars:
  - `DR_EVENTS_TEST_EXTERNAL_SOURCE` (default `smoke_test`)
  - `DR_EVENTS_TEST_EXTERNAL_ID` (default `evt-1`)
- Do not hardcode or commit secrets.

## Conventions
- No direct SQL in controllers; use DB repository modules.
- Validate request and response contracts with Zod.
- Keep API contracts in `docs/api.md` stable.
- Never hardcode taxonomy semantics or entity classification (roles, categories, formats, host/event typing) in UI or API logic. Always source from database taxonomy/config and API payloads so the project stays fully customizable.
