# Host Locations UX Plan (Draft)

## Goal
Support multiple host locations with clear admin editing flow, geocoding assistance, and deterministic API payloads.

## Current State
- `organizers` supports profile-level `city` + `country_code`.
- `organizer_locations` supports multiple rows with optional `geom`.
- Admin UI currently edits a single `primaryLocation`.

## Proposed UX Flow
1. Host edit page has a dedicated **Locations** section.
2. Admin sees a list of existing locations (cards/rows):
   - label
   - formatted address
   - city/country
   - lat/lng
   - map preview marker (if lat/lng exists)
3. Admin can:
   - add new location
   - edit existing location
   - set one location as primary
   - delete location
4. Add/edit location modal:
   - searchable address input (geocode suggestions)
   - manual fields (label, city, country, lat, lng)
   - map preview
   - “Use suggested coordinates” action
5. Save behavior:
   - full replace of organizer locations from form state in one request
   - primary location also mirrors organizer `city`/`country_code` for list filtering

## API Shape (Proposed, additive)
- Extend organizer create/update payload with:
```json
{
  "locations": [
    {
      "id": "optional-for-existing",
      "label": "Studio A",
      "formattedAddress": "Street 1, City",
      "city": "City",
      "countryCode": "US",
      "lat": 40.7128,
      "lng": -74.006
    }
  ],
  "primaryLocationIndex": 0
}
```

## Validation Rules
- `lat` and `lng` must be provided together.
- location object may be coordless if city/country/address exists.
- duplicate locations (same normalized address + coords) should be merged client-side before save.

## Open Questions (Need Product Decision)
1. Should hosts be allowed to have **multiple countries** in profile filtering, or should country derive only from primary location?
2. Should host list/map use:
   - only primary location
   - all locations (one host can appear multiple times on map)?
3. When importer sends a new location set, do we:
   - replace all existing locations
   - merge by fingerprint and keep manual edits?
4. For location accuracy, do we require coords before publishing a host, or keep optional as today?
5. Should “Follow / Notify” require geo-only, or allow city/country-only fallback matching?
