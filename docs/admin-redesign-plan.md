# DanceResource Events — "Manage" Area Redesign
## Complete Implementation Plan v1.0

> **Purpose:** This document is the single source of truth for developers (Claude Code agents) building the new management area. Every decision, data flow, component, and API dependency is specified. When in doubt, refer to this document over any other source.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture & Routing](#2-architecture--routing)
3. [Roles & Permissions Model](#3-roles--permissions-model)
4. [Navigation & Layout](#4-navigation--layout)
5. [Public-Facing Changes](#5-public-facing-changes)
6. [Page Specifications](#6-page-specifications)
   - 6.1 Dashboard (`/manage`)
   - 6.2 My Events (`/manage/events`)
   - 6.3 Create/Edit Event (`/manage/events/new`, `/manage/events/:id`)
   - 6.4 My Hosts (`/manage/hosts`)
   - 6.5 Create/Edit Host (`/manage/hosts/new`, `/manage/hosts/:id`)
   - 6.6 Onboarding — "Post Your Event" (`/manage/apply`)
   - 6.7 Admin: All Events (`/manage/admin/events`)
   - 6.8 Admin: All Hosts (`/manage/admin/hosts`)
   - 6.9 Admin: Users (`/manage/admin/users`)
   - 6.10 Admin: Taxonomies (`/manage/admin/taxonomies`)
   - 6.11 Admin: Applications (`/manage/admin/applications`)
7. [Event Ownership & Import Model](#7-event-ownership--import-model)
8. [Host Claiming Flow](#8-host-claiming-flow)
9. [Onboarding Flow Detail](#9-onboarding-flow-detail)
10. [Rich Text Editor Specification](#10-rich-text-editor-specification)
11. [API Changes Required](#11-api-changes-required)
12. [Database Changes Required](#12-database-changes-required)
13. [Implementation Phases](#13-implementation-phases)
14. [Open Source Considerations](#14-open-source-considerations)

---

## 1. Executive Summary

### What we're building
A complete redesign of the `/admin` area into a new `/manage` area that serves two distinct audiences:

- **Editors** (`dr_events_editor`): Dance teachers, organizers, and hosts who manage their own events and host profiles
- **Admins** (`dr_events_admin`): Platform administrators who manage all content, users, taxonomies, and approve editor applications

### Key design principles
1. **Editors first.** The primary user is a dance teacher managing their weekly class. Every design decision should be evaluated through their eyes.
2. **Not overly complicated.** The system has real complexity (imported events, multi-host, recurring schedules) but the UI must hide it until needed.
3. **Open source ready.** Another community (yoga, music, workshops) should be able to fork this and configure it for their domain via taxonomies alone.
4. **Progressive disclosure.** Show essentials, reveal advanced features on demand.

### Current state → Target state
| Aspect | Current | Target |
|--------|---------|--------|
| URL | `/admin?section=events` | `/manage/events` |
| Nav label | "Admin" (all users) | "Manage" (editors + admins) |
| Layout | Single page, all forms visible | Proper routes, dedicated pages |
| Editor experience | None (admin-only) | Full self-service event/host management |
| Imported events | All visible to all | Ownership-scoped, claimable |
| Onboarding | Email to hello@ | In-app application form |
| Description editing | Plain textarea | Rich text WYSIWYG editor |

---

## 2. Architecture & Routing

### Route structure

```
/manage                           → Dashboard (both roles)
/manage/events                    → My Events list (editor: own only, admin: own)
/manage/events/new                → Create Event form
/manage/events/:id                → Edit Event form
/manage/hosts                     → My Hosts list
/manage/hosts/new                 → Create Host form
/manage/hosts/:id                 → Edit Host form
/manage/apply                     → Onboarding application form (logged-in, no editor role)

--- Admin-only routes (403 for editors) ---
/manage/admin/events              → All Events (browse, search, assign ownership)
/manage/admin/hosts               → All Hosts (browse, search, assign ownership)
/manage/admin/users               → User management (roles, linking)
/manage/admin/taxonomies          → Practices, event formats, organizer roles, UI labels
/manage/admin/applications        → Pending editor applications (approve/reject)
```

### Route protection
- All `/manage/*` routes require authentication (redirect to Keycloak login if unauthenticated).
- `/manage/apply` is accessible to any authenticated user WITHOUT `dr_events_editor` or `dr_events_admin` role.
- `/manage/events`, `/manage/hosts`, `/manage/events/*`, `/manage/hosts/*` require `dr_events_editor` OR `dr_events_admin`.
- `/manage/admin/*` requires `dr_events_admin` only. Editors hitting these routes get a 403 page with a friendly message.
- `/manage` (dashboard) is accessible to both roles, content varies by role.

### Migration from old routes
- `/admin` → redirect to `/manage`
- `/admin?section=events` → redirect to `/manage/events`
- `/admin?section=organizers` → redirect to `/manage/hosts`
- `/admin?section=taxonomies` → redirect to `/manage/admin/taxonomies`
- `/admin?section=users` → redirect to `/manage/admin/users`
- Keep redirects for at minimum 6 months.

---

## 3. Roles & Permissions Model

### Role definitions

| Role | Keycloak role | Can see "Manage" nav | Scope |
|------|--------------|---------------------|-------|
| Regular user | (none) | No — sees "Post your event" button | Can only submit application |
| Editor | `dr_events_editor` | Yes | Own events + events of hosts they manage |
| Admin | `dr_events_admin` | Yes | Everything, including user/taxonomy management |

### Editor permission rules (critical — read carefully)

An editor can **view and edit** an event if ANY of these conditions are true:
1. **They created the event** — `event.created_by_user_id === currentUser.id`
2. **They are linked to a host that is linked to the event** — the user is in the `host_users` table for a host that appears in the event's `event_organizers` table
3. **An admin has explicitly granted them access** — the user is in an `event_users` table (new, see DB changes)

An editor can **create** a new event at any time.

An editor can **view and edit** a host if:
1. **They are linked to that host** — the user is in the `host_users` table for that host
2. **They created the host** — `host.created_by_user_id === currentUser.id`

An editor can **create** a new host at any time.

An editor **CANNOT**:
- Delete events or hosts (only unpublish/cancel — deletion is admin-only)
- Access any `/manage/admin/*` routes
- Edit taxonomies, manage users, or approve applications
- See events/hosts that don't belong to them

### Admin permissions
Admins can do everything editors can, plus:
- View and edit ALL events and hosts (regardless of ownership)
- Manage users (grant/revoke roles, link users to hosts/events)
- Manage taxonomies (practices, event formats, organizer roles, UI labels)
- Review and approve/reject editor applications
- Delete events and hosts
- Claim imported events on behalf of editors

---

## 4. Navigation & Layout

### Main site navigation changes

**Current:**
```
Events | Hosts | Admin | DanceResource | Wiki
```

**New — for unauthenticated users:**
```
Events | Hosts | [Post your event ✦] | DanceResource | Wiki
```

**New — for authenticated users WITHOUT editor/admin role:**
```
Events | Hosts | [Post your event ✦] | DanceResource | Wiki
```

**New — for editors:**
```
Events | Hosts | Manage | DanceResource | Wiki
```

**New — for admins:**
```
Events | Hosts | Manage | DanceResource | Wiki
```

> The "Post your event" button should use a visually distinct style (e.g., outlined/accent button) to draw attention. It links to `/manage/apply` for unauthenticated/regular users (triggers login first if needed).
>
> For editors/admins, the "Post your event" CTA is unnecessary since they already have "Manage" in the nav. However, the button should still appear in the **footer** linking to `/manage/apply` for discoverability.

### Footer changes

**Current footer link:** `"List or manage your event"` → `mailto:hello@danceresource.org`

**New footer:**
```
"Post your event" → /manage/apply (or /manage/events/new if already editor)
"Contact" → mailto:hello@danceresource.org
"DanceResource.org" → https://www.danceresource.org
```

### Manage area layout

The `/manage/*` pages use a **sidebar + main content** layout:

```
┌──────────────────────────────────────────────────────────┐
│  [Site header / main nav — same as public pages]         │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Sidebar   │  Main content area                         │
│  nav       │                                             │
│            │                                             │
│  Dashboard │                                             │
│  ─────────  │                                             │
│  My Events │                                             │
│  My Hosts  │                                             │
│  ─────────  │                                             │
│  ADMIN ▾   │                                             │
│  All Events│                                             │
│  All Hosts │                                             │
│  Users     │                                             │
│  Taxonomies│                                             │
│  Applications │                                          │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│  [Site footer — same as public pages]                    │
└──────────────────────────────────────────────────────────┘
```

### Sidebar navigation items

**For editors:**
```
📊  Dashboard                  /manage
📅  My Events                  /manage/events
    └─ + Create Event          /manage/events/new
👤  My Hosts                   /manage/hosts
    └─ + Create Host           /manage/hosts/new
```

**For admins (everything above, plus):**
```
──── Admin ────────────────
📅  All Events                 /manage/admin/events
👤  All Hosts                  /manage/admin/hosts
👥  Users                      /manage/admin/users
🏷️  Taxonomies                 /manage/admin/taxonomies
📝  Applications               /manage/admin/applications
```

The "Admin" section header and its items are only rendered when the user has `dr_events_admin` role. Editors never see these items.

### Mobile behavior
On mobile (< 768px), the sidebar collapses into a top horizontal tab bar or hamburger menu. The sidebar items should collapse to icons + labels in a horizontal scroll or a slide-out drawer.

---

## 5. Public-Facing Changes

### "Post your event" button
- **Location:** Main navigation bar (between "Hosts" and "DanceResource") and footer
- **Behavior for unauthenticated users:** Clicking triggers Keycloak login, then redirects to `/manage/apply`
- **Behavior for authenticated users without editor role:** Goes directly to `/manage/apply`
- **Behavior for editors/admins:** Button is NOT shown in the nav (replaced by "Manage"). Footer version links to `/manage/events/new`
- **Style:** Visually distinct from other nav items. Use an outlined or accent-colored button style. This is the primary call-to-action for growing the community.

### Event detail page additions (future)
On each public event page (`/events/:slug`), if the current user is an editor with permission to edit that event, show a subtle "Edit this event" link/icon that navigates to `/manage/events/:id`.

### Host detail page additions (future)
Same pattern — if user manages this host, show "Edit host profile" link to `/manage/hosts/:id`.

---

## 6. Page Specifications

### 6.1 Dashboard (`/manage`)

**Purpose:** Landing page after clicking "Manage" in nav. Quick overview and shortcuts.

**For editors:**
```
Welcome back, [name]

┌─────────────────────┐  ┌─────────────────────┐
│  📅 Upcoming Events │  │  👤 My Hosts         │
│  3 upcoming         │  │  2 host profiles     │
│  [View all →]       │  │  [View all →]        │
└─────────────────────┘  └─────────────────────┘

Quick actions:
  [+ Create Event]  [+ Create Host]

Recent activity:
  • "Friday Waves" — next occurrence Mar 28 (published)
  • "Weekend Retreat" — draft, last edited 2 days ago
  • Host "Jane Smith" profile — updated 5 days ago
```

**For admins:** Everything above, plus:
```
Platform overview:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 7,151 events │ │ 494 hosts    │ │ 12 editors   │ │ 3 pending    │
│ total        │ │ total        │ │ active       │ │ applications │
│ [View →]     │ │ [View →]     │ │ [View →]     │ │ [Review →]   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**API calls:**
- `GET /api/admin/events?createdBy=me&status=draft,published&limit=5&sort=updatedAt:desc` (for recent events)
- `GET /api/admin/organizers?managedBy=me&limit=5` (for hosts — needs new API param, see §11)
- `GET /api/admin/stats` (admin only, new endpoint, see §11)
- `GET /api/admin/applications?status=pending&limit=5` (admin only, new endpoint)

---

### 6.2 My Events (`/manage/events`)

**Purpose:** List all events the current editor can manage.

**Layout:**
```
My Events                                    [+ Create Event]

┌─ Filter bar ──────────────────────────────────────────────┐
│ Search [___________]  Status [All ▾]  Practice [All ▾]    │
│ Sort: [Upcoming first ▾]  Show: [Published ▾]             │
└───────────────────────────────────────────────────────────┘

┌─ Event card ─────────────────────────────────────────────┐
│ 🖼️  Friday Waves                           [Published ✓] │
│     5Rhythms · Recurring Class                           │
│     Vienna, Austria                                      │
│     Next: Mar 28, 2026 19:00                             │
│     Host: Marion Braumueller-Henckes                     │
│     ⚠️ Imported from 5rhythms.com — editing detaches     │
│                        from importer                     │
│                                     [Edit] [Unpublish]   │
└──────────────────────────────────────────────────────────┘

┌─ Event card ─────────────────────────────────────────────┐
│ 📝  Weekend Retreat                              [Draft] │
│     Movement Medicine · Weekend Retreat                  │
│     Berlin, Germany                                      │
│     Apr 12-14, 2026                                      │
│     Host: Jane Smith                                     │
│                                      [Edit] [Publish]    │
└──────────────────────────────────────────────────────────┘

Showing 12 of 12 events
```

**Filter bar options:**
- **Search:** Free text, searches title
- **Status:** All | Published | Draft | Cancelled | Unlisted
- **Practice:** Dropdown from `/api/meta/taxonomies` → practices
- **Event format:** Dropdown from taxonomies → eventFormats
- **Time:** Upcoming | Past | All
- **Sort:** Upcoming first (default) | Recently edited | Recently created | Title A-Z

**Event card information:**
- Cover image thumbnail (or placeholder)
- Title (linked to edit page)
- Practice category + event format badges
- Location (city, country) or "Online"
- Next occurrence date/time (for recurring) or event date (for single)
- Host name(s)
- Status badge: Published (green), Draft (gray), Cancelled (red), Unlisted (yellow)
- **Import warning:** If `event.isImported === true` and the event has NOT been detached, show a subtle warning: _"Imported from [source] — editing will detach from automatic updates"_
- Action buttons: Edit, Publish/Unpublish, Cancel (depending on current status)

**Behavior notes:**
- Clicking the event card (not action buttons) navigates to `/manage/events/:id` (edit page)
- Empty state (no events): Show a friendly illustration + "You haven't created any events yet" + [Create your first event] button
- Pagination: Use the same infinite scroll / "Load more" pattern as the public events page for consistency

**API calls:**
- `GET /api/admin/events?managedBy=me&search=...&status=...&practiceCategoryId=...&sort=...&limit=20&offset=0`
  - The `managedBy=me` parameter is NEW (see §11). It returns events where:
    - `created_by_user_id = current user`, OR
    - event is linked to a host that user manages, OR
    - event is explicitly assigned to user in `event_users`

---

### 6.3 Create / Edit Event (`/manage/events/new`, `/manage/events/:id`)

**Purpose:** The core event management form. Single scrollable page with clear sections.

**Layout — single scrollable form with section anchors:**

```
← Back to My Events

Create Event  /  Edit: "Friday Waves"              [Save draft] [Publish]
─────────────────────────────────────────────────────────────────────────

§ BASIC DETAILS
─────────────────────────────────────────────────────
Title *                    [_________________________________]
Slug                       [friday-waves________________] (auto-generated, editable)
Attendance mode            (●) In person  ( ) Online  ( ) Hybrid
Dance practice *           [5Rhythms ▾]
  Subcategory              [None ▾]        (only shows if practice has subcategories)
Event format               [Recurring Class ▾]
Languages *                [🏷️ English ×] [🏷️ German ×] [+ Add]
Tags                       [🏷️ Ceremony ×] [+ Add]


§ SCHEDULE
─────────────────────────────────────────────────────
Schedule type              (●) Single event  ( ) Recurring series
Timezone *                 [Europe/Vienna ▾]     (smart default from browser/location)

── If single: ──
Start *                    [2026-03-28] [19:00]
End *                      [2026-03-28] [22:00]

── If recurring: ──
Recurrence rule            [Every week ▾] on [Friday ▾]
Start time *               [19:00]
End time *                 [22:00]
Series starts *            [2026-03-28]
Series ends                [2026-09-25] or [ ] No end date
  Preview: "Every Friday 19:00–22:00, starting Mar 28" 
  Generated occurrences: 26 dates [Show all ▾]


§ LOCATION
─────────────────────────────────────────────────────
  (hidden if attendance_mode = "online")

Search location *          [____________________________] [🔍]
  → Autocomplete powered by /api/geocode/search
  → Selecting a result populates all fields below

Venue / label              [Tanzhaus Wien_______________]
Address                    [Breite Gasse 7, 1070 Wien___]
City                       [Vienna_____]
Country                    [Austria ▾__]
Coordinates                Lat [48.2008] Lng [16.3469]  (auto-filled, editable)

── If online or hybrid: ──
Online URL                 [https://zoom.us/j/123456____]


§ DESCRIPTION
─────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────┐
  │ B  I  U  H1 H2  • —  🔗  📷                     │
  │                                                  │
  │ Rich text editor area                            │
  │ (see §10 for WYSIWYG specification)              │
  │                                                  │
  │                                                  │
  └──────────────────────────────────────────────────┘


§ COVER IMAGE
─────────────────────────────────────────────────────
  ┌────────────────────┐
  │                    │   [Upload image]  or  paste URL:
  │   Image preview    │   [https://example.com/img.jpg__]
  │   (16:9 aspect)    │
  │                    │   Supported: JPG, PNG, WebP
  └────────────────────┘   Max size: 5MB


§ HOSTS
─────────────────────────────────────────────────────
Linked hosts:

  ┌──────────────────────────────────────────────────┐
  │ 🖼️ Marion Braumueller-Henckes  · Teacher  [× Remove] │
  └──────────────────────────────────────────────────┘

  [+ Add host]  → Opens search modal:
    Search [_____________]
    → Autocomplete from /api/admin/organizers
    → Each result shows: name, city, practice, role options
    → On select: choose role (Teacher, DJ, Organizer, Host)
    → Added to linked hosts list

  [+ Create new host] → Opens inline mini-form or links to /manage/hosts/new
    (with return URL so user comes back to this event after creating host)


§ EXTERNAL LINK (optional)
─────────────────────────────────────────────────────
External event URL         [https://5rhythms.com/event/123]
  (For linking to original event page, ticketing, etc.)


§ IMPORT INFO (read-only, shown only for imported events)
─────────────────────────────────────────────────────
  ⚠️ This event was imported from: 5rhythms.com
  Last synced: Mar 13, 2026 20:17 UTC
  External ID: 5rhythms_workshops:296376
  
  ┌─────────────────────────────────────────────────────────┐
  │ ⚠️ IMPORTANT: If you edit this event, it will be        │
  │ detached from automatic imports. Future updates from     │
  │ the source will no longer sync. This cannot be undone.   │
  │                                                         │
  │ [I understand, proceed with editing]  [Cancel]          │
  └─────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────
                    [Save as Draft]  [Publish]  [Cancel Event]
```

**Field validation rules:**

| Field | Required | Validation |
|-------|----------|------------|
| Title | Yes | Min 3 chars, max 200 chars |
| Attendance mode | Yes | Enum: `in_person`, `online`, `hybrid` |
| Practice category | Yes | Valid UUID from taxonomies |
| Subcategory | No | Valid UUID if provided |
| Event format | No | Valid UUID if provided |
| Languages | Yes | At least one, ISO 639-1 codes |
| Tags | No | Free-text, comma-separated |
| Timezone | Yes | Valid IANA timezone |
| Start/End | Yes | End must be after start |
| Location | Yes (if in_person/hybrid) | Must have city + country at minimum |
| Online URL | Yes (if online/hybrid) | Valid URL |
| Description | No | HTML from rich text editor |
| Cover image | No | URL or uploaded file |

**API calls:**
- Create: `POST /api/events` → returns event with `id`
- Edit: `GET /api/admin/events/:id` → populate form
- Save: `PATCH /api/events/:id`
- Publish: `POST /api/events/:id/publish`
- Unpublish: `POST /api/events/:id/unpublish`
- Cancel: `POST /api/events/:id/cancel`
- Link hosts: `POST /api/admin/events/:id/organizers/replace`
- Upload image: `POST /api/uploads`
- Location search: `GET /api/geocode/search`
- Host search: `GET /api/admin/organizers`

**Import detachment behavior (critical):**
When an editor edits an imported event for the first time:
1. Show the warning modal (above)
2. If confirmed, set a flag `detached_from_import = true` on the event (new DB column, see §12)
3. The importer must check this flag and skip events where it's `true`
4. Show a persistent banner on the edit form: _"This event has been detached from automatic imports. You are managing it manually."_

---

### 6.4 My Hosts (`/manage/hosts`)

**Purpose:** List all hosts the current editor manages.

**Layout:**
```
My Hosts                                       [+ Create Host]

┌─ Host card ──────────────────────────────────────────────┐
│ 🖼️  Marion Braumueller-Henckes                          │
│     5Rhythms · Teacher                                   │
│     Vienna, Austria                                      │
│     8 upcoming events · 3 past events                    │
│     Languages: German, English                           │
│                                              [Edit]      │
└──────────────────────────────────────────────────────────┘

┌─ Host card ──────────────────────────────────────────────┐
│ 🖼️  Ecstatic Dance Vienna                               │
│     Ecstatic Dance · Organizer                           │
│     Vienna, Austria                                      │
│     2 upcoming events                                    │
│     Languages: English                                   │
│                                              [Edit]      │
└──────────────────────────────────────────────────────────┘

Showing 2 of 2 hosts
```

**API calls:**
- `GET /api/admin/organizers?managedBy=me` (new param, see §11)

---

### 6.5 Create / Edit Host (`/manage/hosts/new`, `/manage/hosts/:id`)

**Purpose:** Host profile management form.

**Layout — single scrollable form:**

```
← Back to My Hosts

Create Host  /  Edit: "Marion Braumueller-Henckes"         [Save]
──────────────────────────────────────────────────────────────────

§ BASIC DETAILS
─────────────────────────────────────────────────────
Name *                     [Marion Braumueller-Henckes__]
Website URL                [https://marionbh.com________]
Host type(s) *             [✓] Teacher  [ ] DJ  [ ] Organizer  [ ] Host
Dance practice(s) *        [✓] 5Rhythms  [ ] Open Floor  [ ] ...
Languages *                [🏷️ German ×] [🏷️ English ×] [+ Add]
Tags                       [🏷️ ×] [+ Add]


§ LOCATION
─────────────────────────────────────────────────────
Search location            [____________________________] [🔍]
City                       [Vienna_____]
Country                    [Austria ▾__]
Location label             [Tanzhaus Wien_______________]
Location address           [Breite Gasse 7, 1070 Wien___]
Coordinates                Lat [48.2008] Lng [16.3469]


§ BIO / DESCRIPTION
─────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────┐
  │ B  I  U  H1 H2  • —  🔗  📷                     │
  │                                                  │
  │ Rich text editor area                            │
  │                                                  │
  └──────────────────────────────────────────────────┘


§ AVATAR IMAGE
─────────────────────────────────────────────────────
  ┌──────────────┐
  │              │   [Upload image]  or  paste URL:
  │   Avatar     │   [https://example.com/avatar.jpg_]
  │   preview    │
  │  (1:1 crop)  │   Supported: JPG, PNG, WebP
  └──────────────┘


§ THIS HOST'S EVENTS
─────────────────────────────────────────────────────
  Upcoming events linked to this host:
  • Friday Waves — Mar 28, 2026 (published)
  • Spring Retreat — Apr 12, 2026 (draft)
  [View all events →]  [+ Create event for this host]

──────────────────────────────────────────────────────────────────
                                                    [Save]
```

**API calls:**
- Create: `POST /api/organizers`
- Edit: `GET /api/admin/organizers/:id`
- Save: `PATCH /api/organizers/:id`
- Upload avatar: `POST /api/uploads`

---

### 6.6 Onboarding — "Post Your Event" (`/manage/apply`)

**Purpose:** Application form for users who want to become editors. This is the entry point from the "Post your event" button.

**Access:** Any authenticated user. If user already has `dr_events_editor` role, redirect to `/manage/events/new`.

**Layout:**

```
Post your event on DanceResource
─────────────────────────────────────────────────────

We'd love to help you share your dance events with the community!
To get started, tell us a bit about yourself so we can verify
your identity and give you access to manage your events.

§ ABOUT YOU
─────────────────────────────────────────────────────
Your name *                [________________________]
Email *                    [________________________]  (pre-filled from Keycloak)

What's your role? *
  ( ) I'm a dance teacher and want to post my classes/workshops
  ( ) I organize dance events and want to list them
  ( ) I represent a venue/studio that hosts dance events
  ( ) Other: [________________________]


§ TELL US MORE
─────────────────────────────────────────────────────
Briefly describe your events / teaching practice *
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  (plain textarea, 500 char max)                  │
  │                                                  │
  └──────────────────────────────────────────────────┘

Which dance practice(s)? *
  [✓] 5Rhythms  [ ] Open Floor  [ ] Movement Medicine  [ ] ...

Link to your website or social media *
  [https://________________________________]
  (This helps us verify your identity)


§ CLAIM AN EXISTING HOST (optional)
─────────────────────────────────────────────────────
Are you already listed as a host on DanceResource?

  ( ) No, I'm new
  (●) Yes, I'm one of the existing hosts

  → If yes, show host search:
  Search hosts   [________________________] [🔍]
  → Autocomplete from /api/organizers/search
  
  Selected: "Marion Braumueller-Henckes" (Vienna, 5Rhythms Teacher)
  ✓ I confirm this is me and I'd like to manage this profile.


─────────────────────────────────────────────────────
  [Submit application]

  We'll review your application within 48 hours.
  You'll receive an email when your access is approved.
```

**On submission:**
1. Creates an `application` record in new `editor_applications` table (see §12)
2. Sends notification to admins (email or in-app, depending on what's available)
3. Shows confirmation page: _"Thanks! We'll review your application soon."_

---

### 6.7 Admin: All Events (`/manage/admin/events`)

**Purpose:** Admin view of ALL events in the system. Search, filter, assign ownership, bulk actions.

**Layout:** Similar to "My Events" (§6.2) but with these differences:
- Shows ALL events, not just the current user's
- Additional filter: "Owner" (show events by specific user, or unassigned)
- Additional filter: "Import source" (show events by import source)
- Additional column: "Created by" (username or "Imported")
- Additional actions: "Assign to user", "Detach from import"
- Row actions include: Edit, Publish/Unpublish, Cancel, Delete (with confirmation)

**Key admin workflow — assigning an imported event to an editor:**
1. Admin searches for event (e.g., "Friday Waves Vienna")
2. Clicks "Assign to user"
3. Modal shows user search (searches by username/email)
4. Admin selects user → event is now visible in that editor's "My Events"
5. This can also be done via the Users page (§6.9)

**API calls:**
- `GET /api/admin/events?search=...&status=...&createdBy=...&externalSource=...&sort=...&limit=20&offset=0`

---

### 6.8 Admin: All Hosts (`/manage/admin/hosts`)

**Purpose:** Admin view of ALL hosts. Similar to All Events but for host profiles.

**Layout:** Similar to "My Hosts" (§6.4) but with:
- Shows ALL hosts
- Filter by practice, role, country, import source
- Column: "Managed by" (which editors are linked)
- Actions: Edit, Assign to user, Archive
- Click to see host detail including all linked events and linked users

**API calls:**
- `GET /api/admin/organizers?search=...&roleKey=...&practiceCategoryId=...&sort=...&limit=20&offset=0`

---

### 6.9 Admin: Users (`/manage/admin/users`)

**Purpose:** Manage all users, their roles, and their host/event assignments.

**Layout:**
```
Users                                             [Invite user]

┌─ Search & filter ────────────────────────────────────────┐
│ Search [___________]  Role [All ▾]                       │
└──────────────────────────────────────────────────────────┘

┌─ User row ───────────────────────────────────────────────┐
│ milosgacanovic                                           │
│ Roles: dr_events_admin, dr_events_editor                 │
│ Hosts: Marion BH, Ecstatic Dance Vienna                  │
│ Events: 12 managed                                       │
│                             [Edit roles] [Manage access] │
└──────────────────────────────────────────────────────────┘

┌─ User row ───────────────────────────────────────────────┐
│ janedoe                                                  │
│ Roles: dr_events_editor                                  │
│ Hosts: Jane Doe Teaching                                 │
│ Events: 5 managed                                        │
│                             [Edit roles] [Manage access] │
└──────────────────────────────────────────────────────────┘
```

**"Manage access" modal:**
```
Manage access for: janedoe
──────────────────────────────────────

Linked hosts:
  • Jane Doe Teaching [× Remove]
  • [+ Link host] → host search autocomplete

Linked events (beyond host-derived):
  • Spring Retreat 2026 [× Remove]
  • [+ Link event] → event search autocomplete

Note: This user can also edit all events belonging
to their linked hosts.
                                    [Save] [Cancel]
```

**API calls:**
- User list: New endpoint `GET /api/admin/users` (see §11)
- Edit roles: New endpoint `PATCH /api/admin/users/:id/roles` (see §11)
- Link host: New endpoint `POST /api/admin/users/:id/hosts` (see §11)
- Link event: New endpoint `POST /api/admin/users/:id/events` (see §11)

---

### 6.10 Admin: Taxonomies (`/manage/admin/taxonomies`)

**Purpose:** Manage practices, event formats, organizer roles, and UI labels. Migrate from current `/admin?section=taxonomies`.

**Layout — tabbed interface:**
```
Taxonomies

[Dance Practices] [Event Formats] [Host Roles] [UI Labels]

── Dance Practices tab ──────────────────────────────────

┌─ Practice list ────────────────────────────────────────┐
│ • 5Rhythms                              [Edit] [↕ Reorder] │
│   └─ (no subcategories)                                │
│ • Authentic Movement                    [Edit] [↕]     │
│ • Biodanza                              [Edit] [↕]     │
│   └─ Biodanza Aquatica                  [Edit]         │
│ • Contact Improvisation                 [Edit] [↕]     │
│ • Ecstatic Dance                        [Edit] [↕]     │
│ ...                                                    │
│                                                        │
│ [+ Add practice]   [+ Add subcategory]                 │
└────────────────────────────────────────────────────────┘

── UI Labels tab ────────────────────────────────────────
Category label (singular) * [Dance Practice____]
Category label (plural) *   [Dance Practices___]
                                                 [Save]
```

**API calls:**
- Practices: `GET /api/meta/taxonomies`, `POST /api/admin/practices`, `PATCH /api/admin/practices/:id`
- Event formats: `GET /api/admin/event-formats`, `POST /api/admin/event-formats`, `PATCH /api/admin/event-formats/:id`
- Organizer roles: `POST /api/admin/organizer-roles`, `PATCH /api/admin/organizer-roles/:id`
- UI labels: `GET /api/admin/ui-labels`, `PATCH /api/admin/ui-labels`

---

### 6.11 Admin: Applications (`/manage/admin/applications`)

**Purpose:** Review and approve/reject editor applications from the onboarding form.

**Layout:**
```
Applications                                    [3 pending]

┌─ Application card ───────────────────────────────────────┐
│ 📝 Jane Doe · janedoe@email.com                         │
│    Submitted: Mar 18, 2026                               │
│    Role: Dance teacher                                   │
│    Practice: 5Rhythms, Open Floor                        │
│    Website: https://janedoe-dance.com                    │
│    Description: "I teach weekly 5Rhythms classes in      │
│    Vienna and occasional weekend workshops..."           │
│    Claimed host: Marion Braumueller-Henckes              │
│                                                          │
│    [✓ Approve]  [✗ Reject]  [💬 Request more info]       │
└──────────────────────────────────────────────────────────┘
```

**Approve workflow:**
1. Admin clicks "Approve"
2. System grants `dr_events_editor` role to user via Keycloak admin API
3. If a host was claimed: create `host_users` record linking user to host
4. Send email to user: _"Your application has been approved! You can now manage your events at..."_
5. Application status updated to `approved`

**Reject workflow:**
1. Admin clicks "Reject"
2. Optional: admin can add a reason
3. Send email to user with the reason
4. Application status updated to `rejected`

**API calls:** All new endpoints (see §11)
- `GET /api/admin/applications?status=pending`
- `PATCH /api/admin/applications/:id` (approve/reject)

---

## 7. Event Ownership & Import Model

### How ownership works

Events can come from three sources:
1. **Imported** — created by the importer system (`external_source` is set, `created_by_user_id` is the importer service user)
2. **Created by editor** — created manually via the manage UI
3. **Created by admin** — created via admin interface

### Ownership chain (determines who can edit what)

```
User
 └─ manages Host(s)          (via host_users table)
     └─ Host linked to Event(s)  (via event_organizers table)
         → User can edit Event

User
 └─ created Event directly    (via events.created_by_user_id)
     → User can edit Event

User
 └─ explicitly granted access (via event_users table, new)
     → User can edit Event
```

### Import detachment rules

When an editor edits an imported event:
1. **Before first edit:** Show a modal warning explaining that editing will detach the event from automatic imports. The editor must explicitly confirm.
2. **After confirmation:** Set `detached_from_import = true` (new column) and `detached_at = NOW()` and `detached_by_user_id = current_user.id`
3. **After detachment:** The importer MUST skip this event. It checks `detached_from_import = true` before updating.
4. **Visual indicators:**
   - Not yet detached: Yellow banner _"Imported from [source] — editing will detach from auto-updates"_
   - Already detached: Blue info banner _"Detached from [source] on [date]. You manage this event manually."_
5. **Re-attachment:** Only admins can re-attach an event to imports (edge case, not MVP)

### What "editing" means for detachment purposes
Any change to these fields triggers detachment:
- title, description, schedule (start/end/rrule), location, practice category, event format, attendance mode, cover image, languages, tags

Changes that do NOT trigger detachment:
- Linking/unlinking hosts (organizer assignments)
- Publishing/unpublishing
- Adding the event to "My Events" (claiming)

---

## 8. Host Claiming Flow

### Overview
Editors can request to manage an existing host profile (e.g., "I am Marion Braumueller-Henckes and want to manage my profile").

### Flow
1. **Request:** Editor clicks "Claim existing host" (from onboarding form §6.6, or from a future "Claim this host" button on public host pages)
2. **Pending claim:** Creates a record in `host_claims` table (see §12) with `status: pending`
3. **Admin review:** Claim appears in admin Applications page (§6.11) or a dedicated section
4. **Approval:** Admin verifies (checking website, social media, etc.) and approves → creates `host_users` record
5. **Notification:** Editor gets email/notification that they now manage the host
6. **Result:** All events linked to that host are now visible in the editor's "My Events"

### Edge cases
- **Multiple claims for same host:** Admin sees all pending claims and decides. Only one (or multiple) can be approved.
- **Host already has a manager:** This is fine — multiple users can manage the same host. Admin is aware of existing managers when reviewing.
- **Imported host:** Same flow. The host profile data is preserved; the editor just gets management access.

---

## 9. Onboarding Flow Detail

### Full user journey

```
1. User visits events.danceresource.org
   │
2. Sees "Post your event" button in nav/footer
   │
3. Clicks it
   │
   ├─ Not logged in → Keycloak login → redirect to /manage/apply
   ├─ Logged in, no editor role → /manage/apply
   └─ Logged in, has editor role → /manage/events/new
   │
4. Fills out application form (/manage/apply)
   │  - Intent (teacher/organizer/venue/other)
   │  - Brief description of practice
   │  - Dance practice selection
   │  - Website/social proof link
   │  - Optional: claim existing host
   │
5. Submits → confirmation page
   │  "Thanks! We'll review within 48 hours."
   │
6. Admin sees notification (in-app badge on "Applications" nav item)
   │
7. Admin reviews application
   │
   ├─ Approve:
   │   │  - Grant dr_events_editor role via Keycloak
   │   │  - If host claimed: create host_users link
   │   │  - Send approval email with link to /manage
   │   │
   │   └─ User logs in → sees "Manage" in nav → full access
   │
   ├─ Reject:
   │   │  - Send rejection email (with optional reason)
   │   └─ User can re-apply later
   │
   └─ Request more info:
       │  - Send email asking for more details
       └─ Application stays pending
```

### Application states
- `pending` — submitted, awaiting admin review
- `approved` — admin approved, role granted
- `rejected` — admin rejected
- `more_info_requested` — admin asked for more details

---

## 10. Rich Text Editor Specification

### Requirements
- WYSIWYG editing (not Markdown)
- Must produce clean HTML compatible with the existing `description_json.html` field
- Toolbar: Bold, Italic, Underline, Heading 1, Heading 2, Bullet list, Ordered list, Link, Image embed
- No complex formatting: no tables, no colors, no font changes
- Paste from web: strip formatting, keep structure (headings, lists, links)
- Mobile-friendly

### Recommended library
**TipTap** (built on ProseMirror) — it's React-native, extensible, has great mobile support, and produces clean HTML. It's also the most popular choice for this kind of editor in React applications.

### Configuration
```javascript
// TipTap extensions to include:
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2] },  // Only H1, H2
    }),
    Link.configure({ openOnClick: false }),
    Image,
    Placeholder.configure({ placeholder: 'Describe your event...' }),
  ],
})
```

### Output format
The editor outputs HTML which is stored in `description_json.html`. Ensure the output HTML matches the structure already used by imported events. The API already accepts HTML in the description field.

---

## 11. API Changes Required

### New endpoints needed

#### Editor endpoints (require `dr_events_editor` or `dr_events_admin`)

```
GET  /api/admin/events?managedBy=me
  → Returns events where user has edit access (via ownership, host link, or explicit grant)
  → New query parameter: managedBy=me filters to current user's events
  → Should support all existing filters (status, practiceCategoryId, etc.)

GET  /api/admin/organizers?managedBy=me
  → Returns hosts where user has management access
  → New query parameter: managedBy=me

GET  /api/manage/dashboard
  → Returns dashboard stats for current user:
    { upcomingEventsCount, totalEventsCount, hostsCount, recentActivity[] }
```

#### Admin-only endpoints

```
GET  /api/admin/stats
  → Platform-wide stats: totalEvents, totalHosts, totalEditors, pendingApplications

GET  /api/admin/users
  → List all users with roles
  → Supports search, filter by role
  → Returns: { users: [{ id, username, email, roles[], managedHosts[], managedEventsCount }] }

PATCH /api/admin/users/:id/roles
  → Add/remove roles for a user
  → Body: { add: ["dr_events_editor"], remove: [] }
  → Requires Keycloak admin API integration

POST /api/admin/users/:id/hosts
  → Link a user to a host (creates host_users record)
  → Body: { hostId: uuid }

DELETE /api/admin/users/:id/hosts/:hostId
  → Unlink a user from a host

POST /api/admin/users/:id/events
  → Explicitly grant a user access to an event (creates event_users record)
  → Body: { eventId: uuid }

DELETE /api/admin/users/:id/events/:eventId
  → Remove explicit event access

POST /api/admin/applications
  → Submit an editor application (accessible by any authenticated user)
  → Body: { name, intent, description, practiceCategoryIds[], proofUrl, claimHostId? }

GET  /api/admin/applications
  → List applications (admin only)
  → Supports filter: status=pending|approved|rejected

PATCH /api/admin/applications/:id
  → Approve/reject application
  → Body: { status: "approved"|"rejected"|"more_info_requested", reason? }
  → On approve: trigger Keycloak role grant + host_users creation if host was claimed
```

### Modified endpoints

```
PATCH /api/events/:id
  → Add permission check: user must have edit access (ownership, host link, or explicit grant)
  → Add import detachment logic: if event is imported and detached_from_import is false,
    and the edit modifies content fields, set detached_from_import=true

GET  /api/admin/events
  → Add managedBy=me filter support
  → Add createdBy filter (for admin filtering by user)

GET  /api/admin/organizers
  → Add managedBy=me filter support
```

---

## 12. Database Changes Required

### New tables

```sql
-- Links users to hosts they can manage
CREATE TABLE host_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,            -- Keycloak user ID
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,                  -- admin who created the link, or null if self-claimed
  UNIQUE(user_id, organizer_id)
);
CREATE INDEX idx_host_users_user ON host_users(user_id);
CREATE INDEX idx_host_users_organizer ON host_users(organizer_id);

-- Explicit user-to-event access (beyond host-derived access)
CREATE TABLE event_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  UNIQUE(user_id, event_id)
);
CREATE INDEX idx_event_users_user ON event_users(user_id);
CREATE INDEX idx_event_users_event ON event_users(event_id);

-- Editor applications
CREATE TABLE editor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,            -- Keycloak user ID of applicant
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  intent TEXT NOT NULL,             -- 'teacher', 'organizer', 'venue', 'other'
  intent_other TEXT,                -- free text if intent='other'
  description TEXT NOT NULL,
  practice_category_ids UUID[] NOT NULL,
  proof_url TEXT NOT NULL,
  claim_host_id UUID REFERENCES organizers(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'more_info_requested'
  admin_notes TEXT,                 -- internal notes by admin
  rejection_reason TEXT,            -- shown to applicant
  reviewed_by UUID,                 -- admin who reviewed
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_editor_applications_status ON editor_applications(status);
CREATE INDEX idx_editor_applications_user ON editor_applications(user_id);
```

### Modified tables

```sql
-- Add import detachment tracking to events table
ALTER TABLE events ADD COLUMN detached_from_import BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN detached_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN detached_by_user_id UUID;

CREATE INDEX idx_events_detached ON events(detached_from_import) WHERE detached_from_import = TRUE;
```

---

## 13. Implementation Phases

### Phase 1 — Core Editor Experience (MUST SHIP FIRST)
**Estimated effort: 2-3 weeks**

| Task | Priority | Dependencies |
|------|----------|-------------|
| Set up `/manage` routing structure | P0 | None |
| Implement sidebar layout component | P0 | Routing |
| Database: create `host_users`, `event_users` tables | P0 | None |
| API: `managedBy=me` filter on events + organizers | P0 | DB tables |
| API: permission checks on event/organizer PATCH | P0 | DB tables |
| My Events page with filters | P0 | API filter |
| Create Event form (single scrollable, all sections) | P0 | None |
| Edit Event form (load + save) | P0 | Create form |
| Event publish/unpublish/cancel actions | P0 | Edit form |
| Rich text editor (TipTap) integration | P0 | None |
| Cover image upload + URL support | P1 | Upload API |
| Host linking on event form (search + add) | P0 | Organizers API |
| My Hosts page | P0 | API filter |
| Create Host form | P0 | None |
| Edit Host form | P0 | Create form |
| Dashboard page (editor view) | P1 | Events + Hosts pages |
| Import detachment warning + logic | P0 | DB column |
| Redirect old `/admin` routes | P1 | New routing |
| Update main nav: "Manage" for editors/admins | P0 | Auth context |

**Phase 1 deliverable:** An editor can log in, see "Manage" in the nav, view their events, create/edit events with a rich text editor, manage their hosts, and publish events. Imported events show a detachment warning.

### Phase 2 — Onboarding & Applications
**Estimated effort: 1-2 weeks**

| Task | Priority | Dependencies |
|------|----------|-------------|
| Database: create `editor_applications` table | P0 | None |
| API: application submit + list + review endpoints | P0 | DB table |
| "Post your event" button in main nav + footer | P0 | Auth context |
| Onboarding form (`/manage/apply`) | P0 | API |
| Host claim search on onboarding form | P0 | Organizers search API |
| Admin: Applications page | P0 | API |
| Approval workflow (Keycloak role grant + host linking) | P0 | Keycloak admin API |
| Email notifications (approval/rejection) | P1 | Email service |
| Application status tracking (pending/approved/rejected) | P0 | API |

**Phase 2 deliverable:** New users can apply via "Post your event", optionally claim a host. Admins can review and approve applications, which automatically grants editor access.

### Phase 3 — Admin Tools
**Estimated effort: 1-2 weeks**

| Task | Priority | Dependencies |
|------|----------|-------------|
| Admin: All Events page (full browse) | P0 | Phase 1 |
| Admin: All Hosts page (full browse) | P0 | Phase 1 |
| API: user management endpoints | P0 | Keycloak admin |
| Admin: Users page | P0 | API |
| Admin: user→host and user→event linking UI | P0 | API + DB |
| Admin: Taxonomies page (migrate from current) | P0 | Existing API |
| Admin: Dashboard (platform stats) | P1 | Stats API |
| API: `/api/admin/stats` endpoint | P1 | None |
| Admin: bulk actions on events (publish, assign) | P2 | All Events page |

**Phase 3 deliverable:** Admins have full platform management: user roles, host/event assignment, taxonomy management, and platform overview stats.

### Phase 4 — Polish & Enhancements
**Estimated effort: 1-2 weeks**

| Task | Priority | Dependencies |
|------|----------|-------------|
| "Edit this event" link on public event pages | P2 | Phase 1 |
| "Edit host profile" link on public host pages | P2 | Phase 1 |
| Mobile-responsive sidebar (horizontal tabs / drawer) | P1 | Layout |
| Recurring event UI improvements (calendar preview) | P2 | Phase 1 |
| Timezone picker with smart defaults | P1 | Phase 1 |
| Location autocomplete improvements | P2 | Phase 1 |
| Empty state illustrations and copy | P2 | All pages |
| Loading states and skeleton screens | P1 | All pages |
| Error handling and validation feedback | P1 | All forms |
| Keyboard shortcuts (Ctrl+S to save, etc.) | P3 | Forms |
| i18n: ensure all new strings are translatable | P1 | All pages |

---

## 14. Open Source Considerations

Since this is an open source project others will fork for their own communities:

### What must be configurable (not hardcoded)
- **UI labels:** Already supported via `/api/admin/ui-labels` — "Dance Practice" → "Yoga Style", etc.
- **Taxonomy values:** Practices, event formats, host roles — all managed via admin UI
- **Application form fields:** The "intent" options (teacher/organizer/venue/other) should be driven by host roles from taxonomies, not hardcoded
- **Branding:** The "Post your event" button text should be configurable via UI labels
- **Email templates:** Application approval/rejection emails should be editable

### What can be hardcoded (universal concepts)
- Role names: `dr_events_editor`, `dr_events_admin` (configurable prefix via env var is nice-to-have)
- Permission model: the ownership chain (user → host → event)
- Import detachment logic
- Application workflow states

### Documentation needed
- README section on how to configure the manage area
- Guide on setting up Keycloak roles and realm
- Guide on customizing taxonomies for a different domain
- API documentation for all new endpoints

---

## Appendix A: Data Model Summary (for reference)

### Event fields (from API analysis)
```
id, slug, title, description_json.html,
cover_image_path, external_url,
attendance_mode (in_person|online|hybrid),
online_url,
practice_category_id, practice_subcategory_id,
event_format_id,
tags[], languages[],
schedule_kind (single|recurring),
event_timezone,
single_start_at, single_end_at,
rrule, rrule_dtstart_local, duration_minutes,
status (draft|published|cancelled),
visibility (public|unlisted),
created_by_user_id,
external_source, external_id,
is_imported, import_source, last_synced_at,
detached_from_import (NEW),
detached_at (NEW),
detached_by_user_id (NEW)
```

### Host (organizer) fields
```
id, slug, name, description_json.bio,
website_url, city, country_code,
languages[], tags[],
avatar_path, image_url,
role_keys[] (teacher|dj|organizer|host),
practice_category_ids[],
location_label, location_address, lat, lng,
status, external_source, external_id
```

### Event ↔ Host relationship
```
event_organizers:
  event_id, organizer_id, role_id, display_order
```

### Current stats (from live analysis)
- ~7,151 published events
- ~494 hosts (mostly teachers)
- 17 dance practices
- 7 event formats (Single Session, Recurring Class, Workshop, Weekend Retreat, Intensive, Festival, Teacher Training)
- 4 host roles (Teacher, DJ, Organizer, Host)
- 35 supported UI languages
- Events span 60+ countries
- ~95% of events are imported from external sources

---

## Appendix B: Design Reference

### Visual style notes
- The manage area should feel like a **natural extension of the existing site**, not a separate "admin panel". Use the same header, footer, fonts, and color scheme.
- The sidebar should use subtle background differentiation (e.g., slightly darker/lighter than content area).
- Event and host cards should use the same card design language as the public pages.
- Status badges: Published (green), Draft (gray), Cancelled (red), Unlisted (yellow).
- Action buttons: Primary actions (Publish, Save) are accent-colored. Destructive actions (Cancel, Delete) are red, with confirmation dialogs.
- The rich text editor should feel embedded and natural, not like a foreign widget.
- Dark mode must work throughout — the site already supports it.

### Inspiration
- **Eventbrite Organizer dashboard:** Clean event list, quick actions, clear status indicators
- **Mobilizon:** Open source event management, community-first approach, group-based organization
- **Meetup Organizer:** Unified experience for attendees and organizers, simple event creation
- **Notion:** Rich text editing experience — clean, distraction-free, intuitive formatting
