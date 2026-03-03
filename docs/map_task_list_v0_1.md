# Map Task List v0.1 (MVP)

## MVP Behavior
- `/events` supports `view=list|map` toggle.
- Map requests `GET /api/map/clusters` using current filters, viewport `bbox`, and `zoom`.
- Backend returns GeoJSON `FeatureCollection` with clustered + leaf points.
- Leaf points link to event detail (`/events/:slug`).
- Map shows only occurrences with valid geo coordinates.
- Default date window for map is `from=now` and `to=now+90d`.

## Non-Goals
- No geocoding provider changes.
- No tile vendor scaling strategy changes.
- No importer/scraper changes.
- No architecture rewrite of search/list endpoints.

## API Contract: `GET /api/map/clusters`
Query params:
- `bbox` (required): `west,south,east,north`
- `zoom` (required): int `0..20`
- `from` (optional ISO datetime)
- `to` (optional ISO datetime)
- `q` (optional text)
- search-parity filters (optional):
  - `practiceCategoryId`
  - `practiceSubcategoryId`
  - `tags` (CSV)
  - `languages` (CSV)
  - `attendanceMode`
  - `organizerId`
  - `countryCode`
  - `city`
  - `hasGeo`

Response:
- GeoJSON `FeatureCollection`
- cluster feature properties:
  - `cluster: true`
  - `point_count: number`
- leaf feature properties:
  - `cluster: false`
  - `occurrence_id: string`
  - `event_slug: string`
- top-level additive field:
  - `truncated: boolean` (true when server row cap is reached)

## Caching Strategy
- In-memory LRU cache.
- TTL: 30 seconds.
- Cache key uses:
  - normalized filters
  - rounded bbox
  - zoom
  - date window values

## Data Constraints
- Source table: `event_occurrences`.
- Include only rows where:
  - event + occurrence status are `published`
  - `geom` is present
  - `starts_at_utc` is within requested window
  - row intersects requested bbox
- Hard cap of 5000 rows for clustering per request.

## UI Behavior
- List/map toggle is URL-backed via `view` param.
- Map fetches clusters on `moveend` and `zoomend` (debounced).
- Clicking a cluster zooms in.
- Clicking a leaf point navigates to `/events/:slug`.
- If no map results in bbox, show map empty state.
- Show note that map only includes geo-located events.
- Map ignores list pagination and uses bbox-driven querying.

## Acceptance Checklist
- `/events?view=map` renders without SSR error.
- Panning/zooming updates clusters.
- Cluster click zooms map.
- Point click opens corresponding event detail.
- Filters affect map results consistently with search filters.
- Endpoint returns valid GeoJSON FeatureCollection.
- Endpoint respects bbox/date filters and published+geo constraints.
- Caching logs show hit/miss behavior.
- Typecheck + tests + release gate pass.
