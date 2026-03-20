# Task: Fix all issues in the DanceResource "Manage" area

You are working on the DanceResource Events platform — an open-source event discovery site for conscious dance events (5Rhythms, Ecstatic Dance, Open Floor, etc.). The frontend is a React SPA. The backend is a Node.js API with PostgreSQL.

The site is live at https://events.danceresource.org. The new "Manage" area at `/manage/*` has just been through its first implementation pass. An audit found 3 critical bugs, 12 significant UX issues, and 15 polish items. Your job is to fix ALL of them.

---

## Context files you MUST read first

1. **`events-api.md`** — Complete API contract (all endpoints, parameters, response shapes)
2. **`admin-redesign-plan.md`** — The original design plan with full page specs, data models, and UI wireframes
3. **`manage-area-audit.md`** — The audit report with every issue categorized by severity

Read all three files before making any changes. The audit report references the plan extensively — the plan is the source of truth for what the UI should look like.

---

## Current architecture

- **Frontend:** React SPA (likely Next.js or Vite), with client-side routing for `/manage/*`
- **Backend:** Node.js API at `/api/*`, PostgreSQL database
- **Auth:** Keycloak (roles: `dr_events_admin`, `dr_events_editor`)
- **Rich text editor:** TipTap (already integrated)
- **Existing public pages:** `/events` and `/hosts` have excellent filter/search UX — use them as reference for patterns

---

## Fix priority (do them in this order)

### PHASE 1: Critical bugs (fix these first, they block all usage)

#### BUG-1: All Events admin page returns 500
- **Page:** `/manage/admin/events`
- **Problem:** `GET /api/admin/events?page=1&pageSize=20&status=published&showUnlisted=true` returns HTTP 500
- **Root cause:** The frontend is sending query params (`page`, `pageSize`, `showUnlisted`) that the backend's existing `GET /api/admin/events` endpoint doesn't expect. The original API (see `events-api.md`) uses different pagination conventions.
- **Fix approach:**
  - Check what params the existing `GET /api/admin/events` endpoint actually accepts. It likely uses `limit`/`offset` not `page`/`pageSize`, and may not support `showUnlisted`.
  - Either: (a) update the backend to accept the new params, OR (b) update the frontend to send params the backend already understands.
  - Also add `status` filter support if not already present.
  - Test that the endpoint returns the paginated event list correctly.

#### BUG-2: Dashboard "My" stats all show zero
- **Page:** `/manage` (Dashboard)
- **Problem:** "Upcoming Events: 0", "Total Events: 0", "My Hosts: 0" even for the admin user who should see content.
- **Root cause:** The `managedBy=me` filter logic probably only checks `host_users` and `event_users` tables, which have no rows yet. The admin user's Keycloak ID doesn't match the importer service user's `created_by_user_id`.
- **Fix approach:**
  - For users with `dr_events_admin` role: the "My" stats should show counts for ALL events and hosts on the platform (since admins manage everything). Don't use `managedBy=me` for admins.
  - For users with only `dr_events_editor` role: keep the `managedBy=me` filter (checking created_by_user_id + host_users + event_users).
  - Alternatively, always show the admin's personally-created content in "My" cards, but add a note like "You manage all 9,918 events as admin" or link to All Events.

#### BUG-3: Edit Host "This Host's Events" shows no events
- **Page:** `/manage/hosts/:id`
- **Problem:** Host "jacia Kornwise" shows "No events linked to this host yet" but the public API confirms 8 upcoming + 3 past events.
- **Fix approach:**
  - Check what API endpoint the edit host page calls to load linked events. It should query `event_organizers` joined with `events` for this host's organizer ID.
  - The public endpoint `/api/organizers/:slug` returns `upcomingOccurrences` and `pastOccurrences`. Use this data or replicate the query in the admin endpoint.
  - Display linked events with: title, date, status, and an "Edit" link to `/manage/events/:id`.

### PHASE 2: Error handling (do immediately after bugs)

#### POL-7: Show error messages when API calls fail
- Every page that fetches data should handle errors gracefully.
- When an API returns 4xx or 5xx, show a user-visible error: "Failed to load events. Please try again." with a retry button.
- Never show "0 results" when the real problem is an API error.

#### POL-6: Add loading states
- Show a loading spinner or skeleton screen while API calls are in progress.
- Don't flash empty states before data loads.

### PHASE 3: Critical UX fixes for the Create Event form

These fixes are all on `/manage/events/new` (and the corresponding edit page at `/manage/events/:id`):

#### UX-2 + UX-3: Fix default values
- **Dance practice** dropdown: Change default from "5Rhythms" to the "Select..." placeholder. Make it required — block form submission without a selection.
- **Event format** dropdown: Change default from "Single Session" to "None" or a "Select..." placeholder.

#### MOD-3: Reorder form sections
Current order is illogical. Change to:
```
§ BASIC DETAILS (new section header)
  Title
  Attendance Mode
  Dance Practice
  Subcategory (if applicable)
  Event Format
  
§ SCHEDULE (existing header)
  Schedule Type (Single / Recurring)
  Timezone
  Start / End (for single)
  Recurrence UI (for recurring — see UX-7)

§ LOCATION (existing header)
  Location search
  Location result fields (see UX-8)
  Online URL (if online/hybrid)

§ DESCRIPTION (new section header)
  Rich text editor (TipTap)

§ COVER IMAGE (existing header)
  File upload
  Image URL field (see UX-6)

§ DETAILS (rename or merge)
  Languages
  Tags
  External Link
  Visibility

§ HOSTS (existing header)
  Host selector
  Host role selector
  Linked hosts list
```

#### UX-1: Replace host dropdown with searchable autocomplete
- Remove the native `<select>` with 100+ options.
- Replace with a searchable combobox component. Use `react-select`, `@radix-ui/react-combobox`, or `cmdk`.
- Search should query `/api/admin/organizers?search=...` or filter client-side.
- Each result should show: host name, city/country, practice, role.
- After selecting a host, show it as a tag/chip that can be removed.
- Support adding multiple hosts with different roles.

#### UX-4: Replace CSV text inputs with proper components
- **Languages:** Replace the plain text input (`"en, sr-Latn"`) with a multi-select dropdown showing language names. Map display names to ISO 639-1 codes internally. Use the same languages list that the public `/events` page filter uses.
- **Tags:** Replace with a tag-input component (type, press Enter to add). Add autocomplete from `/api/meta/tags?q=...`.

#### UX-5: Timezone picker
- Replace the plain text input with a searchable dropdown of IANA timezone names.
- Use `Intl.supportedValuesOf('timeZone')` for the list.
- Pre-select the user's browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Show both the timezone name and current UTC offset, e.g., "Europe/Belgrade (UTC+2)".

#### UX-6: Add cover image URL field
- Add a text input below the file upload: "Or paste an image URL"
- If both file and URL are provided, file takes precedence.
- Show an image preview when a URL is entered.
- Same fix needed on the host form for avatar images.

#### UX-8: Location fields after search
- After a location search result is selected, show editable fields for:
  - Venue / label
  - Address
  - City
  - Country
  - Latitude / Longitude
- These should auto-populate from the geocode result but remain editable by the user.
- The search results come from `/api/geocode/search`.

#### UX-7: Recurring event UI
- When schedule type is set to "Recurring", show:
  - Recurrence pattern: "Every [1] [week(s)/month(s)]"
  - Day of week checkboxes (for weekly): Mon, Tue, Wed, Thu, Fri, Sat, Sun
  - Start time and end time
  - Series starts: date picker
  - Series ends: date picker OR checkbox "No end date"
  - Preview text: "Every Friday 19:00–22:00, starting Mar 28, 2026"
  - Generated occurrences count: "This will generate 26 occurrences" [Show all ▾]
- The backend expects `rrule` (RFC 5545 format), `rrule_dtstart_local`, and `duration_minutes`.

#### MOD-9: Add slug field
- Add a slug field below the title.
- Auto-generate from title (lowercase, hyphens, strip special chars) but make it editable.
- Show the preview: "URL: events.danceresource.org/events/[slug]"

### PHASE 4: Admin pages fixes

#### UX-9: Users page — show names and emails
- **Page:** `/manage/admin/users`
- **Problem:** All users show "(No name)" and "—" for email. The API returns Keycloak user IDs but not profile data.
- **Fix:** The backend needs to resolve user details from Keycloak. Either:
  - Call Keycloak Admin API to get user info (name, email) when listing users, OR
  - Cache user profiles in a local `users` table synced from Keycloak, OR
  - At minimum, show the Keycloak username (which should be available from the token)
- Also show the user's roles as badges (e.g., "Admin", "Editor").

#### UX-10: Import detachment warning
- On the edit event page (`/manage/events/:id`), if the event has `isImported === true` and `detached_from_import !== true`:
  - Show a yellow warning banner at the top: "⚠️ This event is automatically imported from [importSource]. Editing will detach it from automatic updates."
  - Before saving any edits to content fields (title, description, schedule, location, practice, format, attendance mode, cover image, languages, tags), show a confirmation modal: "Are you sure? This will stop automatic updates from the import source. This cannot be undone."
  - If confirmed, set `detached_from_import = true` on save.
  - If already detached, show a blue info banner: "This event was detached from imports on [date]. You manage it manually."
- Changes that should NOT trigger detachment: linking/unlinking hosts, publishing/unpublishing.

#### MOD-6: Fix Assign modal user search
- On `/manage/admin/hosts`, the "Assign" modal opens but the user search doesn't return results.
- Fix the search to query the users API and show results.
- On selecting a user, create the `host_users` record linking user to host.

#### MOD-7: Taxonomy delete confirmation
- On `/manage/admin/taxonomies`, all Delete buttons should show a confirmation dialog before deleting.
- The dialog should warn about linked content: "This practice has X linked events and Y linked hosts. Are you sure you want to delete it?"
- For practices with many linked items (>10), make the user type the practice name to confirm.

#### MOD-2: Richer host cards in admin list
- On `/manage/admin/hosts`, each host card currently shows only: name, status, Edit/View/Assign.
- Add: practice category, role type (Teacher/DJ/etc.), city + country, languages, number of linked events.

#### MOD-8: UI Labels pre-fill
- On `/manage/admin/taxonomies` → UI Labels tab, pre-fill the current values from `/api/admin/ui-labels` so admin can see what's currently set.

### PHASE 5: Navigation & layout fixes

#### UX-12: Sidebar active state
- Highlight the current page's sidebar link. Use a left border accent + background tint + bold text.
- Match the current URL with the sidebar href to determine active state.

#### MOD-1: Rename sidebar section labels
- Change "Editor" to "My Content" (or remove the label entirely for the top section).
- Keep "Admin" for the bottom section.

#### MOD-4: Back navigation
- On `/manage/events/new` and `/manage/events/:id`: add "← Back to My Events" above the heading.
- On `/manage/hosts/new` and `/manage/hosts/:id`: add "← Back to My Hosts" above the heading.
- Use `<Link>` component, not browser back.

#### MOD-5: Host list default sort
- On `/manage/admin/hosts`, default sort should be alphabetical by name.

#### POL-8: Mobile sidebar collapse
- At viewport width < 768px, the sidebar should collapse.
- Option A: Slide-out drawer triggered by a hamburger icon.
- Option B: Horizontal scrollable tab bar at the top.
- Currently the sidebar renders at 468px wide on a 375px viewport, pushing content below the fold.

### PHASE 6: Polish

#### POL-1: Dashboard recent activity
- Add a "Recent Activity" section on the dashboard showing the 5 most recently updated events/hosts for the current user.
- Each item: title, type (event/host), last action (created/edited/published), timestamp.

#### POL-2: Dashboard pending applications count
- Add a 4th platform stat card: "Pending Applications: N" with a link to `/manage/admin/applications`.

#### POL-3: Dashboard stat cards linked
- Make "All Events: 9918" clickable → `/manage/admin/events`
- Make "All Hosts: 496" clickable → `/manage/admin/hosts`
- Make "Registered Users: 4" clickable → `/manage/admin/users`

#### POL-4: Role-aware empty states
- On "My Events" for admins: instead of "You haven't created any events yet", show "No events assigned to your account. Browse All Events to manage platform content." with a link to All Events.

#### POL-5: Footer "Post your event" link
- For unauthenticated users: link to `/manage/apply` (which will trigger login first).
- For editors/admins: link to `/manage/events/new` (current behavior, correct).

#### POL-11: Dark mode toggle
- The toggle aria-label cycles inconsistently. When in dark mode (`data-theme="dark"`), the button should be labeled "Light" (indicating what clicking will do). When in light mode, labeled "Dark". Currently the label doesn't always match the state after toggling.

#### POL-12: Pagination info
- On `/manage/admin/hosts` (and All Events once fixed), show "Page 1 of 25" or "Showing 1–20 of 496" alongside the Next/Previous buttons.

#### POL-13: All Hosts search
- Add a text search input on `/manage/admin/hosts` (like the one on My Events) that searches by host name.

#### POL-14: Manual editor invite
- On `/manage/admin/applications`, add an "Add Editor Manually" button that lets admins grant `dr_events_editor` role to any registered user without requiring them to submit an application.

---

## API reference (key endpoints you'll need)

### Existing endpoints (from events-api.md):
```
GET  /api/admin/events                    — list events (editor/admin, uses Bearer token)
GET  /api/admin/events/:id                — single event detail
POST /api/events                          — create event
PATCH /api/events/:id                     — update event
POST /api/events/:id/publish              — publish
POST /api/events/:id/unpublish            — unpublish  
POST /api/events/:id/cancel               — cancel
GET  /api/admin/organizers                — list hosts
GET  /api/admin/organizers/:id            — single host detail
POST /api/organizers                      — create host
PATCH /api/organizers/:id                 — update host
POST /api/admin/events/:id/organizers/replace — link hosts to event
GET  /api/meta/taxonomies                 — practices, formats, roles, labels
GET  /api/geocode/search                  — location autocomplete
GET  /api/meta/tags?q=...                 — tag autocomplete
GET  /api/meta/cities?q=...              — city autocomplete
POST /api/uploads                         — file upload
GET  /api/profile                         — current user profile
```

### New endpoints that may need to be created:
```
GET  /api/admin/stats                     — platform-wide stats (totalEvents, totalHosts, totalEditors, pendingApplications)
GET  /api/admin/users                     — list users with profiles (already exists but missing name/email)
PATCH /api/admin/users/:id/roles          — add/remove roles
POST /api/admin/users/:id/hosts           — link user to host
DELETE /api/admin/users/:id/hosts/:hostId — unlink user from host
GET  /api/admin/applications              — list editor applications  
PATCH /api/admin/applications/:id         — approve/reject application
```

---

## Database tables to be aware of

### Existing:
- `events` — main events table (has `created_by_user_id`, `status`, `external_source`, `external_id`, `is_imported`)
- `organizers` — host profiles
- `event_organizers` — links events to hosts with roles
- `practice_categories` — dance practices
- `event_formats` — format taxonomy
- `organizer_roles` — host role taxonomy

### New tables (from the plan, may already be created):
- `host_users` — links Keycloak user IDs to hosts they manage
- `event_users` — explicit user-to-event access grants
- `editor_applications` — onboarding applications

### New columns on `events` table (from the plan):
- `detached_from_import` (boolean, default false)
- `detached_at` (timestamptz)
- `detached_by_user_id` (uuid)

Check if these tables/columns already exist before creating them.

---

## Important constraints

1. **This is production.** Be careful with database migrations. Always check if tables/columns exist before creating.
2. **Don't break existing API consumers.** The public frontend (`/events`, `/hosts`) and the event importer both use the same API. New params should be additive, not breaking.
3. **Respect the existing design language.** The manage area should look like a natural extension of the public site — same fonts, colors, spacing. Look at how `/events` and `/hosts` pages style their filters and cards.
4. **All text must be translatable.** The site supports 35 languages. Don't hardcode English strings — use the existing i18n system.
5. **Dark mode must work.** Use CSS custom properties / the existing theme system. Test both themes.
6. **The rich text editor (TipTap) is already working.** Don't replace it — just keep it where it is in the reordered form.

---

## Testing checklist (verify after all fixes)

- [ ] `/manage` dashboard shows correct stats for admin (non-zero)
- [ ] `/manage/events` shows events for admin (or appropriate empty state with link to All Events)
- [ ] `/manage/events/new` form has correct section order, defaults to "Select..." for practice/format
- [ ] `/manage/events/new` host selector is searchable
- [ ] `/manage/events/new` languages/tags use proper input components (not CSV text)
- [ ] `/manage/events/new` timezone is a searchable dropdown
- [ ] `/manage/events/new` has cover image URL field
- [ ] `/manage/events/new` recurring schedule shows recurrence UI
- [ ] `/manage/events/new` location search populates editable fields
- [ ] `/manage/events/new` has slug field
- [ ] `/manage/hosts/:id` shows linked events correctly
- [ ] `/manage/admin/events` loads events (no 500 error)
- [ ] `/manage/admin/users` shows real names and emails
- [ ] `/manage/admin/hosts` Assign modal works
- [ ] `/manage/admin/taxonomies` Delete has confirmation dialog
- [ ] Sidebar shows active state for current page
- [ ] Error messages appear when API calls fail
- [ ] Loading states appear while data loads
- [ ] Mobile (375px) sidebar collapses properly
- [ ] Dark mode works on all manage pages
- [ ] All old `/admin` routes redirect to `/manage` equivalents
