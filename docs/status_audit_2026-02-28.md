# DR Events Status Audit (2026-02-28)

Scope: code inspection in `/opt/events` only (API/Web). Runtime-only claims are marked as partial unless directly verified in code paths.

## Events

1. ✅ DONE — SEO/SSR/indexing
- Evidence: [apps/web/app/events/page.tsx](/opt/events/apps/web/app/events/page.tsx) `generateMetadata`, SSR initial fetch; [apps/web/app/events/[slug]/page.tsx](/opt/events/apps/web/app/events/[slug]/page.tsx) metadata + JSON-LD; [apps/web/app/sitemap.ts](/opt/events/apps/web/app/sitemap.ts); [apps/web/app/robots.ts](/opt/events/apps/web/app/robots.ts).
- Verified behavior: `/events` and `/events/[slug]` render server-side metadata and sitemap/robots are implemented.

2. ✅ DONE — Practice category checkboxes + counts
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) practice category checkbox render with `facets.practiceCategoryId` counts.
- Verified behavior: checkbox list with counts and show more/less.

3. ✅ DONE — Tags autocomplete + top 5 on focus (+ counts)
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) tag input with datalist + `onFocus={() => setTagQuery("")}` and `/meta/tags`; [apps/api/src/routes/meta.ts](/opt/events/apps/api/src/routes/meta.ts) tags endpoint with limit and cache.
- Verified behavior: suggestions include counts; focus with empty query requests top items.

4. ✅ DONE — “Event language” checkbox dropdown + counts
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) language checkbox list from `facets.languages`.
- Verified behavior: multi-select language filters with facet counts.

5. ✅ DONE — Rename “Any modality” → “Any event type”
- Evidence: [apps/web/i18n/messages/en.json](/opt/events/apps/web/i18n/messages/en.json) `eventSearch.attendance.anyEventType`; [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx).
- Verified behavior: attendance default label is “Any event type”.

6. ✅ DONE — Country checkbox dropdown + counts
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) country checkbox list from `facets.countryCode`.
- Verified behavior: single-country toggle with counts.

7. ✅ DONE — City autocomplete (country-filtered)
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) city datalist + country-aware query; [apps/api/src/routes/meta.ts](/opt/events/apps/api/src/routes/meta.ts) `/meta/cities` with optional `countryCode`.
- Verified behavior: city suggestions filtered by selected country.

8. ✅ DONE — Remove map-location filter
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) has no hasGeo UI control.
- Verified behavior: map-location filter UI removed.

9. ✅ DONE — Sort asc/desc as links/buttons
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) sort toggle buttons.
- Verified behavior: Soonest/Newest toggles available.

10. ✅ DONE — Filter changes auto-trigger search
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) debounced effect calling `runSearch`.
- Verified behavior: no submit required.

11. ✅ DONE — Remove redundant counts block under Search/Clear
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx).
- Verified behavior: block under filter actions removed; only result count above cards remains.

12. ✅ DONE — Stable image placeholder (no layout shift)
- Evidence: [apps/web/app/globals.css](/opt/events/apps/web/app/globals.css) `.event-card-thumb-shell` fixed 16:9 aspect ratio; [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx).
- Verified behavior: card thumbnail area is reserved before image load.

13. 🟨 PARTIAL — `is_imported` flag + API param + disclaimer hook
- Evidence: [db/migrations/007_events_is_imported.sql](/opt/events/db/migrations/007_events_is_imported.sql), [apps/api/src/db/adminRepo.ts](/opt/events/apps/api/src/db/adminRepo.ts) includes `is_imported` fields.
- Verified behavior: DB/admin exposure exists.
- Missing: public search param and frontend disclaimer hook are not present in this repo.

14. ✅ DONE — Event format taxonomy + filter, includes `teacher_training`
- Evidence: [db/migrations/008_event_format.sql](/opt/events/db/migrations/008_event_format.sql) base taxonomy; [db/migrations/012_event_format_teacher_training_and_user_profile.sql](/opt/events/db/migrations/012_event_format_teacher_training_and_user_profile.sql) upserts `teacher_training`; [apps/api/src/routes/meta.ts](/opt/events/apps/api/src/routes/meta.ts) returns `eventFormats`; [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx) filter UI.
- Verified behavior: additive taxonomy seed + filter UI wired.

15. ✅ DONE — URL updates with filters (shareable)
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx), [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx).
- Verified behavior: state syncs to query string via debounced router replace.

16. ✅ DONE — Back navigation preserves filters/page + scroll position
- Evidence: [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx), [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx).
- Verified behavior: sessionStorage persists scroll keyed by pathname+query and restores within 30 minutes.

17. ✅ DONE — sitemap (+ robots)
- Evidence: [apps/web/app/sitemap.ts](/opt/events/apps/web/app/sitemap.ts), [apps/web/app/robots.ts](/opt/events/apps/web/app/robots.ts).
- Verified behavior: both endpoints implemented.

## Hosts

1. 🟨 PARTIAL — Hosts imported + created + connected to events
- Evidence: [apps/api/src/routes/adminContent.ts](/opt/events/apps/api/src/routes/adminContent.ts) organizer upsert/linking endpoints exist; [db/migrations/011_organizers_external_ref.sql](/opt/events/db/migrations/011_organizers_external_ref.sql).
- Verified behavior: API supports external organizer refs and event-host relation management.
- Missing: importer runtime verification is outside `/opt/events`.

2. ❌ NOT DONE — Host type checkbox dropdown
- Evidence: [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx) uses plain text input for `roleKey`.

3. ❌ NOT DONE — Host tags autocomplete (+ top 5 on focus)
- Evidence: [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx) uses plain CSV text input.

4. ❌ NOT DONE — “Host language” checkbox dropdown + counts
- Evidence: [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx) uses plain CSV text input.

5. ❌ NOT DONE — Host country checkbox dropdown + counts
- Evidence: [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx) uses plain text input.

6. ❌ NOT DONE — Host city autocomplete (country-filtered)
- Evidence: [apps/web/components/OrganizerSearchClient.tsx](/opt/events/apps/web/components/OrganizerSearchClient.tsx) uses plain text input.

## Dashboard / Landing

1. ✅ DONE — Decide landing page
- Evidence: [apps/web/app/page.tsx](/opt/events/apps/web/app/page.tsx) redirects to `/events`.
- Verified behavior: landing is events page.

## Login

1. ✅ DONE — Login/Register buttons top-right on all pages
- Evidence: [apps/web/components/layout/AppShell.tsx](/opt/events/apps/web/components/layout/AppShell.tsx).
- Verified behavior: global shell renders login/register when unauthenticated.

2. ✅ DONE — Show user name when logged in
- Evidence: [apps/web/components/layout/AppShell.tsx](/opt/events/apps/web/components/layout/AppShell.tsx) shows `auth.userName` fallback to profile label.

3. ✅ DONE — Silent SSO auto-login
- Evidence: [apps/web/components/auth/KeycloakAuthProvider.tsx](/opt/events/apps/web/components/auth/KeycloakAuthProvider.tsx) `onLoad: "check-sso"`; [apps/web/app/layout.tsx](/opt/events/apps/web/app/layout.tsx) provider mounted globally.

4. ✅ DONE — Simple profile edit page
- Evidence: [apps/web/app/profile/page.tsx](/opt/events/apps/web/app/profile/page.tsx); [apps/api/src/routes/profile.ts](/opt/events/apps/api/src/routes/profile.ts); [apps/api/src/db/userRepo.ts](/opt/events/apps/api/src/db/userRepo.ts); [db/migrations/012_event_format_teacher_training_and_user_profile.sql](/opt/events/db/migrations/012_event_format_teacher_training_and_user_profile.sql).
- Verified behavior: authenticated user can fetch and patch display name.

## Admin

1. ❌ NOT DONE — Left sidebar nav; each section single page
- Evidence: [apps/web/components/admin/AdminConsole.tsx](/opt/events/apps/web/components/admin/AdminConsole.tsx) current layout is card grid, no left sidebar structure.

2. ❌ NOT DONE — Edit button on event detail when logged in
- Evidence: [apps/web/components/EventDetailClient.tsx](/opt/events/apps/web/components/EventDetailClient.tsx) has no authenticated edit CTA.

## Design

1. ✅ DONE — White background (DR style)
- Evidence: [apps/web/app/globals.css](/opt/events/apps/web/app/globals.css) `--bg: #ffffff`, body background uses `var(--bg)`.

2. ✅ DONE — Logo + favicon
- Evidence: [apps/web/public/logo.svg](/opt/events/apps/web/public/logo.svg), [apps/web/public/favicon.svg](/opt/events/apps/web/public/favicon.svg), [apps/web/app/layout.tsx](/opt/events/apps/web/app/layout.tsx) metadata icons + brand mark.

3. ✅ DONE — Event detail image not cropped (full shown)
- Evidence: [apps/web/components/EventDetailClient.tsx](/opt/events/apps/web/components/EventDetailClient.tsx) cover shell; [apps/web/app/globals.css](/opt/events/apps/web/app/globals.css) `.event-cover { object-fit: contain; }`.

4. 🟨 PARTIAL — Decide time display: user local vs event local
- Evidence: [apps/web/lib/datetime.ts](/opt/events/apps/web/lib/datetime.ts) primary local + secondary event timezone line when zone differs.
- Verified behavior: implemented dual-display format.
- Remaining: policy decision text not documented in product docs.

5. 🟨 PARTIAL — Date/time formatting overhaul
- Evidence: [apps/web/lib/datetime.ts](/opt/events/apps/web/lib/datetime.ts), [apps/web/components/EventSearchClient.tsx](/opt/events/apps/web/components/EventSearchClient.tsx), [apps/web/components/EventDetailClient.tsx](/opt/events/apps/web/components/EventDetailClient.tsx).
- Verified behavior: standardized range format including multi-day.
- Remaining: organizer pages still use older display in places.

## Top 5 Highest-Leverage Missing Items

1. Host search UX parity (checkboxes/autocomplete/counted facets) on `/organizers`.
2. Admin IA cleanup (left sidebar + section pages) for faster operator workflows.
3. Event detail authenticated edit CTA for editor/admin users.
4. Public `is_imported` communication hook (if product still wants importer transparency).
5. Formal product doc for timezone display policy to avoid future regressions.

## Suggested Implementation Order (1-week)

1. Day 1-2: Host filters UX parity (`roleKey`, language, country checkboxes + city/tags autocomplete).
2. Day 3: Event detail edit CTA with role-aware visibility.
3. Day 4: Admin sidebar navigation skeleton with existing forms moved into sections.
4. Day 5: `is_imported` disclaimer hook decision + minimal implementation if approved.
5. Day 5: Document timezone display policy and align remaining organizer/date renderers.
