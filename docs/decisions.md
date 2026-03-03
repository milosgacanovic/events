# ADR Notes

## MVP stack
- Monorepo with npm workspaces
- Next.js web, Fastify API
- PostgreSQL + PostGIS
- Meilisearch for facets/search
- Keycloak OIDC JWT verification via JWKS
- Local upload volume for MVP

## Search + filtering conventions
- Public search remains backward-compatible while supporting CSV multi-select values for selected filters (`practiceCategoryId`, `eventFormatId`, `countryCode`).
- API keeps language/country as codes for contract stability; Web maps codes to localized labels.

## SEO and sitemap strategy
- Keep `/sitemap.xml` as a sitemap index.
- Split event detail URLs into chunked sitemap routes (`/sitemap-events-<n>.xml`) to avoid large single-file sitemaps.
- Keep query-heavy listing pages non-indexable (`noindex,follow` / robots disallow query pages).

## User alerts rollout
- Implemented as a storage + dry-run matching skeleton first:
  - profile CRUD endpoints for alerts
  - admin dry-run endpoint for match visibility
- Delivery pipeline (email/push) intentionally deferred to a later phase.
