# QA Audit Report: /manage Area — Round 9

**Date:** 2026-03-30
**Tester:** Claude (automated via Playwright MCP)
**User:** milos@makonda.com (editor + admin roles)
**Environment:** Production (events.danceresource.org)

---

## Critical Bugs

### 1. DELETE events fails — "Body cannot be empty"
- **Severity:** Critical
- **Where:** Event list card Delete button, Event edit page Delete button
- **Steps:** Archive an event → click Delete → confirm dialog → error
- **Error:** `DELETE /api/events/{id}` returns HTTP error. Console: "Delete failed: Error: Body cannot be empty"
- **Root cause:** `authorizedFetch()` in `manageApi.ts` always sets `Content-Type: application/json` header, even for DELETE requests with no body. Fastify rejects empty body with JSON content type.
- **Impact:** Editors cannot delete any events from the manage area.
- **Fix:** In `authorizedFetch`, only set `Content-Type: application/json` when there is a body, or strip it for DELETE method.

### 2. DELETE hosts fails — same root cause
- **Severity:** Critical
- **Where:** Host list card Delete button, Host edit page Delete button
- **Steps:** Click Delete on an archived host → confirm → silent failure
- **Error:** Same as #1 — `DELETE /api/organizers/{id}` fails.
- **Impact:** Editors cannot delete any hosts. No user-visible error message shown — silent failure.
- **Fix:** Same as #1.

---

## Medium Bugs

### 3. No "Saved as draft!" banner after creating an event
- **Severity:** Medium
- **Where:** Create Event page → Save Draft
- **Steps:** Fill title + practice + dates → click "Save Draft" → page redirects to edit mode
- **Expected:** "Saved as draft!" banner visible
- **Actual:** No banner shown. The redirect from create → edit mode loses the save confirmation.
- **Impact:** User has no visual confirmation that their event was created successfully.

### 4. Archived event publicly viewable via direct URL
- **Severity:** Medium
- **Where:** Public event detail page `/events/{slug}`
- **Steps:** View archived event "No host event" → click "View" on card → navigates to `/events/no-host-event`
- **Expected:** 404 page or "This event has been archived" message
- **Actual:** Full event detail renders (title, dates, practice, attendance mode). The `<title>` shows "Event not found" but the page content displays normally.
- **Impact:** Archived events are meant to be hidden from public but are still accessible via direct link. Confusing mixed signals (title says not found, content shows the event).

### 5. Delete failure shows no user-facing error
- **Severity:** Medium
- **Where:** Both event and host delete actions (list + edit pages)
- **Steps:** Click Delete → confirm → nothing happens
- **Expected:** Error message like "Failed to delete. Please try again."
- **Actual:** Silent failure — button stays active, item remains, no feedback.
- **Impact:** User thinks the action didn't register and may try repeatedly.

---

## Minor / UX Issues

### 6. Auth flash on page navigation
- **Severity:** Minor (cosmetic)
- **Where:** Every /manage page load
- **Steps:** Navigate to any /manage page
- **Observed:**
  - "Checking session..." text appears briefly in header
  - "Manage" nav link is missing during load, appears after auth resolves
  - Footer shows "Post your event" → `/manage/apply` during load, then changes to → `/manage/events/new` after auth
- **Impact:** Brief flash on every navigation. Not blocking but noticeable.

### 7. Draft events don't show dates on cards
- **Severity:** Minor
- **Where:** Events list page
- **Observed:** Published event "Test 3" shows "30 Mar 12:40 – 31 Mar 12:40 2027 · In person" but draft events only show "In person" without dates, even when dates are set.
- **Impact:** Less informative cards for draft events. Makes it harder to distinguish between draft events without clicking into them.

### 8. Create Event timezone defaults to UTC instead of browser timezone
- **Severity:** Minor
- **Where:** Create Event page → Schedule → Timezone field
- **Expected:** Should default to user's browser timezone (e.g., Europe/Belgrade)
- **Actual:** Shows "UTC (UTC)"
- **Note:** The edit page correctly shows "Europe/Belgrade (GMT+2)" for existing events, so this is only a create-page issue. May be intentional but is surprising for users.

### 9. Language options inconsistency between Events and Hosts
- **Severity:** Minor (cosmetic/consistency)
- **Where:** Create/Edit Event vs Create/Edit Host language pickers
- **Observed:**
  - Events: ~27 language options (Arabic through Vietnamese)
  - Hosts: ~50 language options (includes Albanian, Bulgarian, Catalan, Estonian, Georgian, Hungarian, Icelandic, Irish, Latvian, Lithuanian, Macedonian, Malay, Maltese, Norwegian, Slovak, Slovenian, Swahili, Tamil, Telugu, Urdu, Welsh, Zulu, etc.)
- **Impact:** A host who teaches in Estonian can mark that language on their profile but cannot mark events as being in Estonian.

---

## Working Correctly

- **Dashboard:** Stats (upcoming events, total events, hosts), recent activity, create buttons all work
- **Events list:** Filtering by status/attendance/practice works, disjunctive faceting, URL persistence, sort options, result count updates
- **Interactive chips:** Draft → "Edit" on hover (links to edit page), Archived → "Un-Archive" on hover (triggers action)
- **Event card actions:** Edit, Publish, Unpublish, Cancel, Archive all work from cards
- **Edit event form:** Save, "Edited." indicator on change, status-aware save messages, status dropdown with descriptions
- **Host card:** Archived chip hover → Un-Archive works, Events count badge
- **Edit host form:** "This Host's Events" section, roles/practices selection, status management
- **Create host:** Save Draft + Save and Publish buttons
- **Dark mode:** All manage pages render correctly in dark mode with proper contrast
- **Mobile responsive:** Events list, edit forms, host cards all adapt well to 375px width. Hamburger menu works.
- **Manage submenu:** Dashboard / My Events / My Hosts tabs work, active state highlights correctly
- **Sort icon:** Visible next to sort dropdown

---

## Test Data Note

A "QA Test Event" (archived, Ecstatic Dance) was created during testing but could not be deleted due to Bug #1. It needs manual cleanup via the database or admin API.

---

## Screenshots

All screenshots saved in `temporary/qa-*.png` (21 files).
