# MVP Reconciliation Checklist

Use this checklist to verify `constitution.md` MVP Definition of Done (Section 22) and Epics A-H acceptance.

## 1) Bootstrap and Runtime
- `docker compose --env-file /opt/events/.env -f /opt/events/deploy/docker/docker-compose.yml up -d --build`
- `curl -sS https://beta.events.danceresource.org/api/health | jq '.'`
- Pass criteria:
  - response has `"ok": true`
  - `db` and `meili` are `"ok"`
  - web app loads at `/events`

## 2) Public Search + Facets + Pagination
- `curl -sS 'https://beta.events.danceresource.org/api/events/search?page=1&pageSize=20' | jq '{hits:(.hits|length), facets:(.facets|keys), pagination:.pagination}'`
- `curl -sS 'https://beta.events.danceresource.org/api/organizers/search?page=1&pageSize=20' | jq '{items:(.items|length), facets:(.facets|keys), pagination:.pagination}'`
- Pass criteria:
  - events response includes `hits`, `facets`, `pagination`
  - organizers response includes `items`, `facets`, `pagination`
  - web `/events` and `/organizers` show Prev/Next pagination controls after a search

## 3) Map Clusters
- `curl -sS 'https://beta.events.danceresource.org/api/map/clusters?bbox=-180,-85,180,85&zoom=2' | jq '{type, featureCount:(.features|length)}'`
- Pass criteria:
  - `type` is `FeatureCollection`
  - response includes `features` array

## 4) Auth and RBAC
- No token:
  - `curl -sS -o /tmp/admin.out -w '%{http_code}' https://beta.events.danceresource.org/api/admin/events && cat /tmp/admin.out`
- Editor/admin token tests (manual):
  - with token lacking required role -> `403`
  - with `dr_events_editor` or `dr_events_admin` role -> `200` for editor endpoints
- Pass criteria:
  - unauthenticated call returns `401`
  - role enforcement returns `403` and `200` as expected

## 5) Editor and Admin Core Flows (Manual UI)
- `/admin` login via Keycloak
- Editor can:
  - create host
  - create event (single and recurring)
  - publish event and see it publicly
- Admin can:
  - edit category taxonomy
  - edit host roles
  - edit category singular/plural labels
- Pass criteria:
  - all actions complete without API contract errors
  - changes reflected on public pages/search where applicable

## 6) Local Quality Gates
- `npm -C /opt/events run typecheck -w @dr-events/api`
- `npm -C /opt/events run typecheck -w @dr-events/web`
- `npm -C /opt/events test`
- Pass criteria:
  - all commands exit `0`
