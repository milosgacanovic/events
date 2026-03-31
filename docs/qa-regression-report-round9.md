# QA Regression Report — Round 9

**Date:** 2026-03-31
**Tester:** Automated (Playwright MCP + Claude)
**Environment:** Production (`events.danceresource.org`)
**User:** milos_makonda (editor role, no admin role)

---

## Summary

Tested 18 areas across the platform including public pages, manage area, search, i18n, mobile responsive, dark mode, and error states. Found **12 issues** ranging from critical UX problems to minor data inconsistencies.

---

## Bugs Found

### CRITICAL

#### 1. Auth loading flash on all detail pages
- **Where:** `/events/[slug]`, `/hosts/[slug]`
- **Issue:** When navigating to any event or host detail page, a "Loading event..." / "Loading host..." message shows for 1-2 seconds while Keycloak auth initializes — even for published, publicly accessible content.
- **Impact:** Every visitor sees an unnecessary loading delay before content renders. This is the single biggest UX issue on the platform.
- **Root cause:** The fetch waits for `auth.ready` before making the API call, but published content doesn't need auth.
- **Screenshot:** `temporary/qa-13-public-events-map.png` (map loads fine, but detail pages have the flash)

#### 2. Admin access denied for milos_makonda
- **Where:** `/manage/admin/*`
- **Issue:** The user `milos_makonda` has editor role but no admin role. Admin tabs (Events, Hosts, Taxonomies, Users, Applications, Tags) do not appear in the manage submenu. Navigating directly to `/manage/admin/events` shows "Admin access required."
- **Impact:** Cannot manage imported events, taxonomies, user roles, or applications without admin access.
- **Note:** This may be intentional (user simply needs admin role assigned in Keycloak), but it blocks admin testing.

---

### HIGH

#### 3. Host 404 page shows raw error instead of friendly message
- **Where:** `/hosts/[nonexistent-slug]`
- **Issue:** Shows `Request failed: 404 (not_found)` — a raw technical error message. Compare to events 404 which shows a clean "Event not found" heading with "The requested event does not exist or is unavailable" and a "Back to events" link.
- **Impact:** Poor UX for any dead/broken host link. Looks like a broken page.
- **Screenshot:** `temporary/qa-15-host-404.png`

#### 4. Multiple redundant API retries on 404 pages
- **Where:** `/events/[nonexistent-slug]`, `/hosts/[nonexistent-slug]`
- **Issue:** When a public fetch returns 404, the client retries with auth token (up to 3 additional requests). Console shows 4 total failed requests for a single nonexistent slug. This wastes bandwidth, increases server load, and delays the "not found" display.
- **Impact:** Unnecessary server load; slower 404 response for users.

#### 5. Language switch resets auth state and "Event's local time" checkbox
- **Where:** Any page with the language dropdown
- **Issue:** Switching language triggers Keycloak re-init. During re-init:
  - "Checking session..." appears instead of the username
  - "Manage" link disappears from nav temporarily
  - The "Event's local time (event timezone)" checkbox resets to unchecked
  - Time labels switch from "event timezone" to "your timezone" (UTC)
- **Impact:** Users who prefer event local time lose their preference on every language switch. Auth state flicker is confusing.

---

### MEDIUM

#### 6. Mixed Content warnings (Keycloak HTTP iframe on HTTPS page)
- **Where:** Every page
- **Issue:** Console shows 2-4 `Mixed Content` warnings per page load. Keycloak's `silent-check-sso` loads an HTTP iframe on the HTTPS page.
- **Impact:** Browser security warnings. Some browsers may block the iframe, breaking silent SSO.
- **Fix:** Configure Keycloak to use HTTPS for the silent-check-sso redirect URI.

#### 7. "Test 3" event visible in public event listing
- **Where:** `/events` (main public event search)
- **Issue:** A test event titled "Test 3" with practice "InnerMotion" appears in the public search results alongside real events. It has no cover image and uses the fallback logo.
- **Impact:** Unprofessional appearance for real users browsing events.
- **Fix:** Either unpublish the test event or delete it.

#### 8. Duplicate host entries: "Alex Svoboda" and "Alex Svoboda What"
- **Where:** `/hosts` listing
- **Issue:** Two host entries exist for what appears to be the same person. "Alex Svoboda What" looks like a test/accidental duplicate. Both show as "freedomDANCE · Teacher" with no avatar (initials "AS" shown instead).
- **Impact:** Data quality issue; confusing for users searching for this teacher.

#### 9. "France, France" — bad location data for host "Adrien Labaeye"
- **Where:** `/hosts` listing, host card for Adrien Labaeye
- **Issue:** City is set to "France" and country is "France", resulting in "France, France" displayed. The city should be an actual city name (or left blank).
- **Impact:** Looks like a data import error. Makes the location useless.

---

### LOW

#### 10. Mobile: no language switcher or dark mode toggle accessible
- **Where:** Mobile viewport (375px), hamburger menu
- **Issue:** The hamburger menu only contains navigation links (Events, Hosts, Manage, DanceResource, Wiki). Language switcher and dark mode toggle are in the desktop header but not accessible in mobile.
- **Impact:** Mobile users cannot switch language or toggle dark mode.
- **Screenshot:** `temporary/qa-17-mobile-menu.png`

#### 11. Create Event form — Save buttons appear mid-form (sticky positioning)
- **Where:** `/manage/events/new`
- **Issue:** "Save Draft" and "Save and Publish" buttons appear between the "Format" dropdown and "Schedule" section, floating in the middle of the form. They use sticky positioning so they're always visible, but visually they break up the form flow.
- **Impact:** Slightly confusing form layout — the buttons look like they belong between sections rather than being a persistent action bar.
- **Screenshot:** `temporary/qa-14-create-event-form.png`

#### 12. Footer "Post your event" link inconsistent across pages
- **Where:** Footer across all pages
- **Issue:** The footer "Post your event" link points to `/manage/apply` for non-logged-in or freshly-loaded pages, but changes to `/manage/events/new` after auth resolves (for editors). This is by design but creates a flash where the link destination changes after page load.
- **Impact:** Minor — link works correctly in both cases.

---

## Areas Tested (No Issues Found)

| Area | Status | Notes |
|------|--------|-------|
| Homepage / Event search | OK | 7,243 events, quick pills work, facet counts correct |
| Event cards (public) | OK | Images, dates, locations, host names, tags all render correctly |
| Event detail page | OK | Full content, description, schedule, hosts, share, follow all present |
| Host list (public) | OK | 516 hosts, avatars, practices, locations, languages render |
| Host detail page | OK | Description, upcoming events, past events, follow section all work |
| Public events map | OK | Leaflet clusters render, zoom works, markers visible worldwide |
| Search functionality | OK | "berlin" returns 509 relevant results, URL updates with `?q=berlin` |
| i18n (German) | OK | All UI labels, filter names, country names, tags translated correctly |
| Manage dashboard | OK | Welcome message, stats (1 upcoming, 5 total, 1 host), recent activity |
| Manage events list | OK | Cards with status chips, action buttons, filters, sort, map toggle |
| Event edit form | OK | All sections present: basic, schedule, location, description, image, languages, tags, hosts |
| Profile page | OK | Display name, language preference, timezone toggle |
| Dark mode | OK | Toggle works, all pages render correctly in dark mode |
| Mobile responsive | OK | Hamburger menu, stacked cards, readable text, no horizontal overflow |
| Mobile manage area | OK | Tab navigation, event cards, action buttons all accessible |
| Pagination ("Load more") | OK | Shows "Showing 20 of 7,243", button present |
| 404 event page | OK | Eventually shows "Event not found" with back link (but has loading flash) |
| Footer | OK | Copyright, contact, post event, CC license links all present |

---

## Recommendations (Priority Order)

1. **Fix auth loading flash** (Critical #1) — Implement two-phase fetch: try public first, retry with auth on 404. Plan already exists.
2. **Fix host 404 page** (High #3) — Add friendly "Host not found" message matching the events 404 pattern.
3. **Reduce 404 retries** (High #4) — Don't retry with auth if the resource is clearly not found.
4. **Fix language switch resetting timezone preference** (High #5) — Persist the checkbox state in localStorage across language changes.
5. **Fix Keycloak mixed content** (Medium #6) — Update Keycloak silent-check-sso to use HTTPS.
6. **Clean up test data** (Medium #7, #8) — Unpublish/delete "Test 3" event and "Alex Svoboda What" host.
7. **Fix "France, France" location** (Medium #9) — Update Adrien Labaeye's city field.
8. **Add mobile language/dark mode access** (Low #10) — Include these controls in the hamburger menu or profile dropdown.

---

## Screenshots

All screenshots saved in `temporary/`:
- `qa-01-homepage.png` through `qa-12-event-edit-form.png` (from previous session)
- `qa-13-public-events-map.png` — Public events map view
- `qa-14-create-event-form.png` — Full create event form
- `qa-15-host-404.png` — Host not found (raw error)
- `qa-16-mobile-events.png` — Mobile events page
- `qa-17-mobile-menu.png` — Mobile hamburger menu
- `qa-18-mobile-manage-events.png` — Mobile manage events
