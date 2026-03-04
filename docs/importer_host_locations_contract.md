# Importer Host Locations Contract

This document defines how importer/scraper must send host locations to DR Events API.

## API payload fields

Send on host create/update (`POST /api/admin/organizers/upsert-external` or `PATCH /api/organizers/:id`):

- `locations`: full replacement array
- `primaryLocationId`: id of one item in `locations` when ids are known; otherwise omit and mark one item with `isPrimary: true`

Each location item supports:

- `id` (optional, uuid; for updates)
- `externalSource` (optional)
- `externalId` (optional)
- `isPrimary` (optional)
- `label` (optional)
- `formattedAddress` (optional)
- `city` (optional)
- `countryCode` (optional)
- `lat` and `lng` (must be provided together when present)
- `provider` (optional, e.g. `nominatim`)
- `placeId` (optional)

## Importer behavior

1. Build deterministic location list per host from source data.
2. Include geocoded `lat/lng` when source provides it.
3. If source has only one location, send one item and mark primary.
4. If source has no explicit primary, choose deterministic primary (first stable-sorted item).
5. Send full list each upsert so API can replace atomically.

## External references

When source has stable location ids, set:

- `externalSource = <source key>`
- `externalId = <source location id>`

If source has no location id, use deterministic hash:

- `sha1(source + "|" + host_external_id + "|" + normalized_address)`

## Backward compatibility

Legacy `primaryLocation` remains supported temporarily, but importer should migrate to `locations[]`.
