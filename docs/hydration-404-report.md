# Fix report: hydration errors on event pages + real 404s

Handoff: `/opt/dr-admin/uploads/inbox/1794426564820_3d5886728e46_fix-hydration-and-404.md`.
Commits (main, deployed 2026-11-11, active colour green):

- `304176a` fix(web): hydration-safe event pages (stored "Your time" preference)
- `8a83419` fix(web): real HTTP 404 for missing events and hosts

No URLs, titles, meta, JSON-LD, sitemaps or robots rules changed. No Search Console action is needed.

## 1. Root cause

### Hydration (#425 ×6, #418, #423 on every event page)
The errors only appear for visitors who had once switched the "Event time / Your time" toggle to **Your time**. `EventDetailClient` read that choice from localStorage in a `useState` initializer (`useState(() => readTimeDisplayMode())`), so:

- the **server** rendered every date in the event's timezone (it can't see localStorage);
- the browser's **first render** used the viewer's timezone.

Every date and time string therefore differed. React threw away the server HTML and client-rendered the whole document, because the mismatch happened outside any Suspense boundary.

**How it was reproduced.** Production Playwright runs with a Europe/Belgrade viewer and `dr-events-time-display-mode=user` in localStorage gave exactly #425×6, #418×1 and #423×1 on `/events/pulse-47` and `/events/sweat-your-prayers-429`. City, series, host and listing pages stayed clean. Without the stored preference, all pages were clean in all three handoff contexts.

**Exact diffs** (dev-mode React and a server-HTML vs hydrated-DOM comparison, viewer Europe/Belgrade):

`/events/pulse-47` (event timezone Europe/London):

| Element | Server | Client |
|---|---|---|
| `span.event-detail-rsvp-date` | `26 Nov 2026 · 19:00–21:30` | `26 Nov 2026 · 20:00–22:30` |
| `span.event-detail-meta-value` (When) | `26 Nov 2026 · 19:00–21:30 · Ponavlja se nedeljno` | `… 20:00–22:30 …` |
| toggle label | `(Europe/London)` | `(Europe/Belgrade)` |
| upcoming dates (5 rows) | `26 Nov / 03 / 10 / 17 / 24 Dec 2026 · 19:00–21:30` | `… · 20:00–22:30` |

`/events/sweat-your-prayers-429` (Europe/Berlin, same offset as Belgrade):

| Element | Server | Client |
|---|---|---|
| toggle label | `(Europe/Berlin)` | `(Europe/Belgrade)` |

Dev-mode React reported `Text content did not match. Server: "26 Nov 2026 · 19:00–21:30" Client: "26 Nov 2026 · 20:00–22:30"` in `EventDetailClient`, then `There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.`

**Also fixed** (dev-only warnings or latent risks on the same pages):

- **Description HTML:** the server used a regex strip and the browser used DOMPurify + linkify. That's a `dangerouslySetInnerHTML` mismatch on event and host pages.
- **Share/calendar URLs** were built from `window.location` / `document.title` during render. The server fallback for the calendar link even used the event id instead of the slug.
- **`suppressHydrationWarning`** on the toggle-label container, which hid part of the problem.
- **Counts** formatted with `toLocaleString()` without a locale (search pages).

**Lead 1 in the handoff ("Fri" vs "Fr") was not a hydration mismatch.** The web container has full ICU (`de` formats as "Fr., 13. Nov. 2026") and the locale comes from the layout, so it's the same on both sides. The cookieless curl got English HTML while the browser had a German locale.

### 404s
`/events/[slug]` and `/hosts/[slug]` never called `notFound()`. When the API returned 404, the server rendered the client component with no data, and the client showed "not found" with HTTP 200. There's no `loading.tsx`, so streaming was not involved.

## 2. Files changed

**Hydration**
- `apps/web/lib/useTimeDisplayPreference.ts` (new):
  - "event"/"UTC" on the server and the first client render;
  - the stored mode and the browser timezone are applied after mount;
  - the preference is written only when the visitor changes it.
- `apps/web/components/EventDetailClient.tsx`:
  - uses the hook;
  - removes the container `suppressHydrationWarning`;
  - builds share/calendar URLs from the slug;
  - makes description sanitizing hydration-safe;
  - drops a dead `updatedLabel`.
- `apps/web/components/EventSearchClient.tsx`: uses the hook; counts take the locale.
- `apps/web/components/OrganizerDetailClient.tsx`: hydration-safe description sanitizing.
- `apps/web/components/OrganizerSearchClient.tsx`: counts take the locale.
- `apps/web/app/profile/account/page.tsx`: reads the stored mode and timezone after mount.

**404s**
- `apps/web/app/events/[slug]/page.tsx`:
  - status-aware fetch: API 404 → slug-history redirect, else `notFound()`; 5xx or network errors render as before;
  - the event client sits in its own `<Suspense>` boundary.
- `apps/web/app/hosts/[slug]/page.tsx`: status-aware fetch; API 404 → `notFound()`.
- `apps/web/app/events/[slug]/not-found.tsx`, `apps/web/app/hosts/[slug]/not-found.tsx` (new): the friendly page, with title "Event/Host not found | DanceResource".
- `apps/web/components/EntityNotFound.tsx` (new):
  - links to `/events` and `/hosts` (`/events` is the search page);
  - a signed-in visitor gets one retry with their token, so editors still open drafts. The public API 404s for drafts.
- `apps/web/app/globals.css`: link row on the 404 page.

**Test and monitoring**
- `apps/web/e2e/hydration.spec.ts` (new).
- `scripts/seo-audit-cron.sh`: runs the hydration test after `seo_audit.py`.

## 3. Playwright results (`apps/web/e2e/hydration.spec.ts`, against production)

**Contexts.** The handoff's three plus two with a stored "Your time" preference. Without that preference, the handoff's spec passes even on the broken build, so it couldn't detect the bug.

| Context | Before (old build) | After (deployed) |
|---|---|---|
| Europe/Belgrade, sr-Latn-RS | passed | passed |
| Asia/Tokyo, de-DE | passed | passed |
| America/Los_Angeles, en-US | passed | passed |
| Europe/Belgrade + stored "Your time" | **failed**: 4/4 event pages, 8 hydration errors each (#425 first) | passed |
| Asia/Tokyo + stored "Your time" + `dr_locale=de` | **failed**: 4/4 event pages, 8 errors each | passed |

Before: `2 failed, 3 passed (2.7m)`. After: `5 passed (2.5m)`. Pages per context: `/events`, `/events/in/gb/london`, `/series/saturday-noon-rome`, `/hosts/christian-de-sousa`, plus the first 4 URLs of `sitemap-events-1.xml`.

## 4. curl results (production, after deploy)
```
404  /events/this-event-does-not-exist-xyz   (title "Event not found | DanceResource", robots noindex)
404  /hosts/no-such-host-xyz                 (title "Host not found | DanceResource")
200  /events/pulse-47                        (live event)
200  /events/friday-evening-in-paris-center-27  (archived/past event: still 200 + noindex)
200  /hosts/christian-de-sousa
200  /hosts/abiola-abrams                    (inactive host: 200 + noindex)
200  /events/in/gb/london
200  /series/saturday-noon-rome
```

**404 caching.** 404 responses carry `cache-control: public, s-maxage=300, stale-while-revalidate=600` from `next.config.mjs`. That header covers all of `/events*` and `/hosts*`, and Next.js can't vary config headers by status. The handoff allows a short s-maxage, and Cloudflare doesn't cache this HTML (`cf-cache-status: DYNAMIC`).

**Renamed slugs** are still checked before a 404: `event_slug_history` → 308. There's no renamed event in the history yet, so it couldn't be shown live.

## 5. `scripts/seo_audit.py --seed 1` after deploy
```
Event URLs in sitemaps: 6036 | sampled: 60 | fetch errors: 0
  [PASS] noindex pages listed in sitemap: 0
  [PASS] non-self canonicals: 0
  [PASS] pages without Event JSON-LD: 0
  [PASS] entity-encoding bugs: 0
  [INFO] offers coverage (info, not enforced): 0%
  [PASS] duplicate titles in sample: 0
  [PASS] descriptions >= 80 chars: 60/60
  [PASS] JSON-LD image present: 60/60
  [PASS] host pages linking back to event: 5/5
  [PASS] noindex host pages in hosts sitemap (1214 listed): 0/10
  [PASS] noindex city pages in cities sitemap (71 listed): 0/5
  [PASS] noindex series hubs in series sitemap (535 listed): 0/5
```

## 6. Monitoring
- **No CI.** The repo has no CI pipeline, so the hydration test runs in the **daily 04:30 UTC audit** (`scripts/seo-audit-cron.sh`, root crontab) right after `seo_audit.py`.
- **Alerting:** a failure sends the Telegram alert with the failing paths, and the run still ends with `seo-audit finished — exit N` for the daily report.
- **Node:** cron's PATH only has an old system Node, so the wrapper puts the nvm Node first.
- **Verified:** the wrapper was run once under a cron-like environment (`env -i PATH=/usr/bin:/bin`); see section 7.
- **Manual run:** `cd /opt/events && npx playwright test apps/web/e2e/hydration.spec.ts` (set `BASE_URL` to test another host).

## 7. Notes
- **Manual check for the owner:** while signed in as admin, open a draft event or host URL. It should render after sign-in. The HTTP status is 404, which is correct for a non-public page.
- **Wrapper run (2026-11-11 20:25 UTC, `env -i PATH=/usr/bin:/bin`):**
  - the hydration step found the nvm Node: `5 passed (2.5m)`, `hydration test exit 0`;
  - `seo_audit.py` (random 60-URL sample) failed **one** check, `entity-encoding bugs: 1` on `/events/rorelse-andamp-reflektion-41`, so the wrapper exited 1 and sent the Telegram alert as designed.
- **That finding is unrelated to this fix.** It's a data issue in 52 live Open Floor descriptions.
  - The source has `…/products&nbsp</a>;`: its linkifier cut the `;` off `&nbsp;`. The page and the JSON-LD therefore showed "products&nbsp;".
  - Importer `445693b` repairs it in `DescriptionCleaner` (G0b) and makes the description backfill detect it (`split_entity`).
  - The dry run queues exactly those 52 events (`split_entity 52 → 0`, nothing else). They're republished with `backfill_published_descriptions.php --include-ongoing --apply` after the owner approves. Until then, the daily audit may alert on them.
