# Runbook

## Services
- Postgres + PostGIS
- Meilisearch
- API (Fastify)
- Web (Next.js)

## Health
- API: `/api/health`

## Cron
- Daily recurring horizon refresh:
  - `docker exec dr_events_api npm run occurrences:refresh`
