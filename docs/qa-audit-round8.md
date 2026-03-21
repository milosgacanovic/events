# QA Audit Report — Round 8

**Date:** 2026-03-21
**URL:** https://events.danceresource.org
**Tester:** Automated (Playwright MCP)
**Logged in as:** milosgacanovic@gmail.com (admin)

## Summary

The site is in excellent shape. All major features work correctly across public pages, the manage area, and admin tools. No critical or significant bugs were found. The Round 7 fixes (HostForm dropdowns, admin host country names) are verified working. Zero JavaScript console errors across all pages tested. The site handles 7,170 events and 497 hosts with good performance.

**0 critical, 0 significant, 4 minor issues found.**

## Critical issues

None.

## Significant issues

None.

## Minor issues

### 1. Mixed Content warnings on events page
- **Page:** `/events`
- **What:** 6 "Mixed Content" warnings in console — the HTTPS page loads some HTTP resources (likely event cover images from external sources)
- **Impact:** Browsers may block these images; no visible breakage currently but images may fail to load for some users

### 2. "Adrien Labaeye" shows "France, France" for location
- **Page:** `/hosts` list, `/manage/admin/hosts`
- **What:** City field contains "France" instead of an actual city name, so display reads "France, France"
- **Impact:** Looks wrong for this one host (data quality, not code bug)

### 3. Two orphaned user records with UUID names
- **Page:** `/manage/admin/users`
- **What:** Users "988e1c6b-da75-4b" and "67ab9a64-62f9-48" have no email, no roles, no content — likely stale Keycloak records
- **Impact:** Clutter in user list

### 4. `/manage/apply` redirects to `/manage/events/new` for authenticated editors
- **Page:** `/manage/apply`
- **What:** Editors skip the apply page and go straight to create event. Likely intentional but worth confirming.

## Round 7 fix verification

| Fix | Status |
|-----|--------|
| HostForm country dropdown (was empty) | CONFIRMED WORKING — shows "1 selected" → "United States ×" |
| HostForm language dropdown (was empty) | CONFIRMED WORKING — shows "2 selected" → "Russian ×", "English ×" |
| Admin hosts raw country codes | CONFIRMED WORKING — shows "San Francisco, United States" etc. |

## What works well

### Public pages
- Events listing: 7,170 events, sorted correctly, search works, quick-filter chips with counts
- Event detail: Full metadata, description, host link, import attribution, booking links
- Hosts listing: 496 hosts alphabetically, photos, locations, practices, languages
- Host detail: Avatar, bio, metadata, follow/notify, upcoming + past events
- Map views: Both events and hosts render with Leaflet clustering
- Filters: All facet groups functional

### Manage area
- Dashboard: Stats, recent activity feed, create buttons
- Sidebar: Two sections with active highlighting
- Admin All Events: 9865 events, filters, import badges, action buttons, pagination
- Admin All Hosts: 497 hosts, filters, resolved country names, event counts
- Host edit form: All fields working including country/language dropdowns (Round 7)
- Create Event form: Complete with all fields, timezone picker, rich text editor
- Users: Table with role management
- Taxonomies: CRUD with reordering
- Applications: Status filtering

### Cross-cutting
- Dark mode: All elements styled correctly
- Mobile (375px): Fully responsive, hamburger menu, sidebar drawer
- Auth: Keycloak SSO, admin role gating
- i18n: 35 languages
- Console: Zero JS errors across all pages
- Performance: No duplicate API calls, all requests 200
