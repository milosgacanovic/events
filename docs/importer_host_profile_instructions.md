# Importer/Scraper Instructions: Host Profile + Location

## Scope
Importer and scraper changes needed to fully support host profile quality in DR Events API.

## Critical: Profile Fields That Drive Filters

The hosts search page has sidebar filters for **Host Type (role)**, **Practice/Category**, and
**Language**. These filters operate on the host's *profile* fields — not on their events.

| Filter | Source field | How it's populated |
|---|---|---|
| Host Type | `organizer_profile_roles` table | send `profileRoleIds` in upsert |
| Category | `organizer_practices` table | send `practiceCategoryIds` in upsert |
| Language | `organizers.languages` column | send `languages` in upsert |

**If these fields are empty on the host profile, the host will be invisible to those filters.**
The `event_organizers` join data is used only as a display/facet count fallback — it is NOT
used for filtering.

---

## API: Upsert a Host

`POST /api/admin/organizers/upsert-external` (requires editor Bearer token)

### All Fields

```json
{
  "externalSource": "my-scraper",
  "externalId": "host-123",
  "name": "Jane Smith",
  "status": "published",

  "languages": ["en", "fr"],
  "profileRoleIds": ["9fe46dad-bda1-4062-aa62-e76271b9edcd"],
  "practiceCategoryIds": ["32145b60-bd17-4d99-89a4-89b1cdbb2787"],

  "websiteUrl": "https://example.com",
  "externalUrl": "https://source-platform.com/jane",
  "imageUrl": "https://cdn.example.com/jane.jpg",
  "tags": ["ecstatic", "5rhythms"],
  "descriptionJson": {
    "bio": "Short bio.",
    "info": "Practical info.",
    "description": "Long-form description."
  },
  "city": "Berlin",
  "countryCode": "de",
  "primaryLocation": {
    "label": "Berlin",
    "city": "Berlin",
    "countryCode": "de",
    "lat": 52.52,
    "lng": 13.405
  }
}
```

### `languages` — BCP47 codes
Array of lowercase language codes: `["en", "fr", "de", "es", "ar", "cs"]`.
- Reject UUID-like strings.
- Normalize to lowercase.
- Skip codes shorter than 2 chars or not matching `[a-z]{2,3}(-[a-z0-9]{2,8})*`.
- Source: host's profile page, bio language, explicit "teaches in" fields.

### `profileRoleIds` — role UUIDs (REQUIRED for Host Type filter)

Resolve role keys → UUIDs via `GET /api/meta/taxonomies` (field `organizerRoles`) or use the
stable IDs below. Send the array of UUIDs matching the host's role(s).

**Current role IDs (stable, do not change without a migration):**

| key | UUID | Use when |
|---|---|---|
| `teacher` | `9fe46dad-bda1-4062-aa62-e76271b9edcd` | hosts classes, workshops, retreats |
| `organizer` | `a9e37e35-7fe1-4160-b330-7a44ae893d23` | organizes jams, events, festivals |
| `dj` | `2d82dc8d-9b62-4d37-9347-1b63c998c609` | provides music for events |
| `host` | `53819e9d-39bf-40bb-8f23-a53fccec07ea` | provides space / hosts venues |

A host can have multiple roles: `["9fe46dad-...", "a9e37e35-..."]`.

If you omit `profileRoleIds` (undefined), the existing roles are preserved.
If you send `[]`, all profile roles are cleared.

### `practiceCategoryIds` — practice UUIDs (REQUIRED for Category filter)

Resolve practice keys → UUIDs via `GET /api/meta/taxonomies` (field `practices.categories`).
Send UUIDs for each dance practice the host teaches or organizes.

**Current practice IDs (fetch fresh from `/api/meta/taxonomies` — new practices may be added):**

| key | UUID |
|---|---|
| `ecstatic-dance` | `32145b60-bd17-4d99-89a4-89b1cdbb2787` |
| `contact-improvisation` | `b43781d3-de3e-48f2-869a-ef0d7a75c4d6` |
| `5rhythms` | `249ddb1f-64ad-4fe1-bf43-3ce4e428802e` |
| `open-floor` | `91644dd5-6460-4f9f-afe2-182985958ef0` |
| `biodanza` | `928ffdb9-1693-4e84-9d30-2e9917de8a33` |
| `authentic-movement` | `c9b22794-3462-44b5-a980-96b08bcd7639` |
| `soul-motion` | `43a4648a-b06e-4543-9343-a574f0e67374` |
| `movement-medicine` | `8ae8c598-302b-4851-b2d4-c94636b2ab86` |
| `dance-meditation` | `5afddf2b-76a7-4b5a-830c-ab2712972ec9` |
| `somatic-movement` | `052d1e19-ce4e-478b-949c-2e6313010d60` |
| `nia` | `b15aefd2-57cc-4a4a-a64d-a69b797f58af` |
| `heart-in-motion` | `c1b0ddcb-be30-408e-b7ab-903bc23865a3` |
| `integral-dance` | `18a92d98-8cbd-429b-ba0b-9e1ab30656d2` |
| `chakradance` | `e87d09fc-99dd-492a-8689-a797233a6969` |
| `innermotion` | `83d4138b-9fbd-4f13-a6e1-77f9a5386895` |
| `freedomdance` | `af70980e-28c6-4fe7-96ff-b8f802c4ef4f` |
| `other` | `2b8fbd58-13b9-482d-82b5-482a9d70b8a9` |

Always resolve from the API at import time rather than hardcoding, so newly added practices
are automatically picked up.

If you omit `practiceCategoryIds` (undefined), existing practices are preserved.
If you send `[]`, all profile practices are cleared.

---

## Resolving Roles and Practices at Import Time

```
GET /api/meta/taxonomies
```

Response includes:
```json
{
  "organizerRoles": [
    { "id": "9fe46dad-...", "key": "teacher", "label": "Teacher" },
    ...
  ],
  "practices": {
    "categories": [
      { "id": "32145b60-...", "key": "ecstatic-dance", "label": "Ecstatic Dance" },
      ...
    ]
  }
}
```

Build lookup maps at the start of each import run:
```js
const taxonomies = await fetchJson('/api/meta/taxonomies');
const roleByKey = Object.fromEntries(taxonomies.organizerRoles.map(r => [r.key, r.id]));
const practiceByKey = Object.fromEntries(taxonomies.practices.categories.map(p => [p.key, p.id]));
```

Then resolve at host upsert time:
```js
profileRoleIds: inferredRoleKeys.map(k => roleByKey[k]).filter(Boolean),
practiceCategoryIds: inferredPracticeKeys.map(k => practiceByKey[k]).filter(Boolean),
```

---

## Inferring Roles and Practices from Source Data

When the source doesn't have explicit role/practice fields, infer from available signals:

**Roles** — check title, bio, tags, event types:
- "teacher", "instructor", "facilitator", "trainer" → `teacher`
- "organizer", "host" (of events/jams) → `organizer`
- "DJ", "music" → `dj`
- "venue", "space", "studio host" → `host`

**Practices** — check name, bio, tags, event titles:
- Match practice keys/labels case-insensitively against bio and event names.
- Use `other` only as a last resort when no specific practice matches.

---

## `primaryLocation` Shape

```json
{
  "label": "optional short label",
  "formattedAddress": "optional full address",
  "city": "optional city",
  "countryCode": "optional ISO 3166-1 alpha-2 lowercase",
  "lat": 52.52,
  "lng": 13.405
}
```

---

## `descriptionJson` Contract

Send all available textual sections separately:
```json
{
  "bio": "short bio",
  "info": "practical info",
  "description": "long-form description",
  "text": "plain text fallback",
  "html": "<p>optional safe html fallback</p>"
}
```

---

## Importer Checklist

1. Fetch taxonomies once per run, build `roleByKey` and `practiceByKey` maps.
2. For each host:
   - Infer `profileRoleIds` from source signals (title, bio, tags).
   - Infer `practiceCategoryIds` from source signals (bio, event names, tags).
   - Extract `languages` from profile language fields; normalize to BCP47 lowercase.
   - Extract `city`, `countryCode`, `primaryLocation` with coordinates where available.
   - Upsert via `POST /api/admin/organizers/upsert-external`.
3. After event upsert, link host to event via `POST /api/admin/events/:id/organizers/replace`.
4. Keep `externalSource + externalId → organizerId` in-memory cache per run.

## Backfill Verification

After a backfill run, verify:
- Host Type filter returns results for `teacher`, `organizer`, etc.
- Category filter returns results for `ecstatic-dance`, `contact-improvisation`, etc.
- Language filter returns only hosts whose `languages` profile includes the selected code.
- Host detail shows image, description, location, and roles.
