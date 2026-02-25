# API Contracts (MVP)

Base path: `/api`

## Public
- `GET /api/health`
- `GET /api/meta/taxonomies`
- `GET /api/events/search`
- `GET /api/events/:slug`
- `GET /api/organizers/search`
- `GET /api/organizers/:slug`
- `GET /api/map/clusters`
- `GET /api/geocode/search`
- `GET /api/uploads/*`

## Editor/Admin (Bearer token)
- `GET /api/admin/events`
- `GET /api/admin/events/:id`
- `GET /api/admin/organizers`
- `GET /api/admin/organizers/:id`
- `POST /api/admin/locations`
- `POST /api/organizers`
- `PATCH /api/organizers/:id`
- `POST /api/events`
- `PATCH /api/events/:id`
- `POST /api/events/:id/publish`
- `POST /api/events/:id/unpublish`
- `POST /api/events/:id/cancel`
- `POST /api/uploads`

## Admin only
- `POST /api/admin/practices`
- `PATCH /api/admin/practices/:id`
- `POST /api/admin/organizer-roles`
- `PATCH /api/admin/organizer-roles/:id`

See `constitution.md` for complete behavior and field-level requirements.
