# Importer/Scraper Instructions: Host Profile + Location

## Scope
Importer and scraper changes needed to fully support host profile quality in DR Events API.

## API Fields to Send (Organizer Upsert)
Use `/api/admin/organizers/upsert-external` with:
- `externalSource` (required)
- `externalId` (required)
- `name` (required)
- `websiteUrl` (optional)
- `externalUrl` (optional official profile URL)
- `languages` (optional array of BCP47 codes, e.g. `["en","fr"]`)
- `tags` (optional)
- `descriptionJson` (optional object)
- `city` (optional)
- `countryCode` (optional)
- `imageUrl` (optional absolute URL)
- `primaryLocation` (optional)

`primaryLocation` shape:
```json
{
  "label": "optional short label",
  "formattedAddress": "optional full address",
  "city": "optional city",
  "countryCode": "optional ISO country code",
  "lat": 0.0,
  "lng": 0.0
}
```

## Description JSON Contract (Recommended)
Send all available textual sections separately to avoid information loss:
```json
{
  "bio": "short bio",
  "info": "practical info",
  "description": "long-form description",
  "text": "plain text fallback",
  "html": "<p>optional safe html fallback</p>"
}
```

## Scraper Requirements
1. Extract and pass:
   - host image URL
   - host website / official URL
   - language codes
   - bio/info/description separately when source has distinct fields
2. Location extraction:
   - parse city/country from source profile
   - parse address if available
   - parse coords if available
3. Normalize language codes:
   - reject non-language UUID-like values
   - lowercase and validate BCP47-like format

## Importer Behavior
1. Upsert host by external ref.
2. If profile has location data, send `primaryLocation`.
3. Link host to events after event upsert/publish.
4. Keep in-memory cache of `externalSource+externalId -> organizerId` per run to reduce API calls.

## Backfill Checklist
1. Re-run host backfill mode after scraper update.
2. Verify:
   - host detail shows image and description
   - host detail shows location block
   - map clusters include hosts with geo
   - no invalid language code leakage
