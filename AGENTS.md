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
