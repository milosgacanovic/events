# Manage Area Layout Redesign — Horizontal Submenu + Sidebar Filters

## Overview

Two major changes to the `/manage` area layout:

1. **Convert the current vertical sidebar navigation into a horizontal submenu** (tab bar) that sits below the main site header
2. **Add a sidebar filter panel** (same component/pattern used on `/events` and `/hosts` public pages) to the manage list pages

---

## 1. Horizontal Submenu

### What it replaces

The current manage area has a vertical sidebar on the left with navigation links grouped under "MY CONTENT" and "ADMIN" section headers. This entire sidebar navigation needs to become a horizontal submenu bar below the main site header.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Main site header — Events · Hosts · Manage · etc.]         │
├──────────────────────────────────────────────────────────────┤
│  Dashboard · My Events · My Hosts  |  All Events · All Hosts · Users · Taxonomies · Applications · Tag Suggestions  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Page content below                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Items before the separator: visible to all editors and admins
- The `|` is a simple visual separator (thin vertical line or extra spacing)
- Items after the separator: visible only to admins (`dr_events_admin` role)
- Active page gets the same kind of highlight treatment as the current sidebar active state (underline, bold, background tint — whatever fits the design)
- On mobile: the submenu should scroll horizontally if it overflows, or wrap to a second line — no hamburger menu for this bar

### Navigation items and their routes

**Editor items (all authenticated users with editor or admin role):**
- Dashboard → `/manage`
- My Events → `/manage/events`
- My Hosts → `/manage/hosts`

**Admin-only items (after separator, `dr_events_admin` only):**
- All Events → `/manage/admin/events`
- All Hosts → `/manage/admin/hosts`
- Users → `/manage/admin/users`
- Taxonomies → `/manage/admin/taxonomies`
- Applications → `/manage/admin/applications`
- Tag Suggestions → `/manage/admin/tags`

### What to remove

- The entire vertical sidebar navigation component/container from the manage layout
- The "MY CONTENT" and "ADMIN" section labels
- The "Create Event" link that was a sub-item in the sidebar (it moves to the toolbar bar above the list — see section 3)

---

## 2. Sidebar Filter Panel

### Concept

Use the **same sidebar filter component** that already exists on the public `/events` and `/hosts` pages. The manage list pages should get this same filter panel on the left side, with additional manage-specific filters added.

### Which pages get the filter sidebar

**Pages WITH filter sidebar:**
- My Events (`/manage/events`)
- My Hosts (`/manage/hosts`)
- All Events (`/manage/admin/events`)
- All Hosts (`/manage/admin/hosts`)

**Pages WITHOUT filter sidebar (full-width content):**
- Dashboard (`/manage`)
- Users (`/manage/admin/users`)
- Taxonomies (`/manage/admin/taxonomies`)
- Applications (`/manage/admin/applications`)
- Tag Suggestions (`/manage/admin/tags`)

### Filter sidebar for Events pages (My Events + All Events)

Use the same filter component as the public `/events` page. The sidebar should include ALL of these filters:

**Manage-specific filters (add these — they don't exist on the public page):**
- **Status** — All statuses / Draft / Published / Cancelled / Archived (currently exists as inline buttons on manage pages)
- **Source** (admin only) — All sources / Imported only / Manual only / Detached only (currently exists on admin All Events page)
- **Ownership** (admin only) — All owners / Has owner / Unassigned (currently exists on admin All Events page)

**Filters from the public `/events` page (reuse the same component/logic):**
- **Search by title** — text input
- **Event date** — Today / Tomorrow / This weekend / This week / Next week / This month / Next month / Date range / In the past
- **Attendance** — In person / Online
- **Dance Practice** — all practices with counts (5Rhythms, Biodanza, Contact Improvisation, Ecstatic Dance, freedomDANCE, Movement Medicine, Nia, Open Floor, etc.)
- **Event format** — Single Session / Recurring Class / Workshop / Weekend Retreat / Intensive / Festival
- **Event language** — all languages with counts
- **Country** — all countries with counts
- **City** — text input
- **Tags** — text input

**Current inline dropdown filters on manage pages to REMOVE (they move into the sidebar):**
- The practice dropdown (`All practices` select)
- The format dropdown (`All formats` select)
- The time dropdown (`All time` / Upcoming / Past select)
- The status buttons (Draft / Published / Cancelled / Archived)
- The source buttons (admin page: Imported only / Manual only / Detached only)
- The ownership buttons (admin page: Has owner / Unassigned)
- The country dropdown (admin page: `All countries` select)

All of these are replaced by the sidebar filter panel.

### Filter sidebar for Hosts pages (My Hosts + All Hosts)

Use the same filter component as the public `/hosts` page. The sidebar should include ALL of these filters:

**Manage-specific filters (add these):**
- **Status** — All statuses / Draft / Published / Archived (currently exists as inline filter on admin All Hosts page)

**Filters from the public `/hosts` page (reuse the same component/logic):**
- **Search by name** — text input
- **Host Role** — Teacher / DJ / Organizer / Host (with counts)
- **Dance Practice** — all practices with counts
- **Host Language** — all languages with counts
- **Country** — all countries with counts
- **City** — text input

**Current inline dropdown filters on manage host pages to REMOVE (they move into the sidebar):**
- The practice dropdown
- The role dropdown
- The country dropdown
- The status buttons

---

## 3. Toolbar Bar Above the List (Reuse Public Page Container)

The public `/events` page has a toolbar bar above the event list that looks like this:

```
[ Filters ]   7,291 results        [↑] [↓]    | [List view] [Map view] |
```

Reuse the **same container/component** on the manage list pages, but adapt the controls:

### Events toolbar (My Events + All Events)

```
[ + Create Event ]   1,234 results     [ Sort: Recently edited ▾ ]    | [List view] [Map view] |
```

- **Left:** "Create Event" button (replaces the "Filters" button position) — links to `/manage/events/new`
- **Center-left:** Result count, e.g. "1,234 results" (same style as public page). No need for "Showing 1-20 of X" format — just the simple count.
- **Center-right:** Sort dropdown (replaces the up/down arrow buttons) with options: Recently edited / Next occurrence / Recently created / Title A-Z
- **Right:** List view / Map view toggle (same as public page)

### Hosts toolbar (My Hosts + All Hosts)

```
[ + Create Host ]   510 results     [ Sort: Recently edited ▾ ]    | [List view] [Map view] |
```

- **Left:** "Create Host" button — links to `/manage/hosts/new`
- **Center-left:** Result count
- **Center-right:** Sort dropdown with options: Recently edited / Recently created / Name A-Z
- **Right:** List view / Map view toggle

### Why this matters

The "Filters" button on the public page opens the sidebar filter panel on mobile. On the manage pages, the sidebar filter is already there (on desktop) or triggered the same way (on mobile). So the "Filters" button position is repurposed for the create action, which is the primary action editors want to take. The sort controls replace the simple up/down arrows with a proper labeled dropdown so it's clear what the sort options are.

---

## 4. Implementation Notes

### Reuse the existing filter component

The public `/events` and `/hosts` pages already have a fully working sidebar filter with collapsible sections, counts, multi-select buttons, text inputs for city/tags, and an "Apply" button. **Do not rebuild this from scratch.** Reuse or extend that component so that:

- The filter sections are configurable (pass in which sections to show)
- Manage-specific sections (Status, Source, Ownership) can be added as additional sections
- The filter state syncs with the URL query params (same pattern as public pages)
- The API calls for the manage list pages respect these filter params

### Layout structure

For pages with sidebar filters:
```
┌──────────────────────────────────────────────────────────────┐
│  [Main header]                                               │
│  [Horizontal submenu]                                        │
├──────────┬───────────────────────────────────────────────────┤
│          │  [+ Create Event]  234 results  [Sort ▾]  [≡] [◎]│
│  Filter  ├───────────────────────────────────────────────────┤
│  sidebar │                                                   │
│          │  Event/host cards list                             │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

For pages without sidebar filters (Dashboard, Taxonomies, Users, Applications, Tag Suggestions):
```
┌──────────────────────────────────────────────────┐
│  [Main header]                                    │
│  [Horizontal submenu]                             │
├──────────────────────────────────────────────────┤
│                                                  │
│  Full-width content                              │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Mobile behavior

- The horizontal submenu: horizontally scrollable on small screens
- The filter sidebar: same mobile behavior as the public pages (collapses, accessible via a "Filters" button that opens it as a drawer/overlay)
- On mobile, the toolbar should show both a "Filters" button (to open the sidebar drawer) AND the "Create Event/Host" button — since the sidebar is hidden on mobile, users still need a way to open it. The "Filters" button can be smaller/secondary and the "Create" button primary, or they can sit side by side.

### What NOT to change

- The main site header (Events / Hosts / Manage / DanceResource / Wiki links) stays exactly as is
- The event and host card designs within the list stay as they are
- The create/edit forms stay as they are
- The Dashboard, Users, Taxonomies, Applications, Tag Suggestions page content stays as is — only the surrounding layout changes (sidebar nav removed, horizontal submenu added)
- The public `/events` and `/hosts` pages are not affected by this change
