# Events Platform Redesign Plan

Redesign the events discovery experience across 5 pages, bringing visual cohesion with danceresource.org's calm, spacious, organic aesthetic.

**Design direction:** Calm, not overwhelming. Helping not selling. Warm, organic, mindful.

**Reference:** danceresource.org main site — centered layouts, generous whitespace, subtle borders, outlined buttons, organic illustrations, sections with alternating warm/white backgrounds.

## Pages in Scope

1. Events discovery (search + list + map)
2. Event detail
3. Hosts directory
4. Host detail
5. Profile

## Key Decisions

| Topic | Decision |
|-------|----------|
| Card layout | Horizontal (image left 160x120, content right) |
| Filter sidebar | Collapsible on desktop (hidden by default), bottom drawer on mobile |
| Hero section | Yes — search prominent, quick-start pills, geolocation |
| Quick pills | Auto-populated from taxonomy by event count |
| Pagination | "Load more" button + "Back to top" floating button |
| Geolocation | "Near you" pill in hero, browser API + reverse geocode |
| Hosts directory | Same patterns as events (sidebar, cards, hero) |
| Split map/list | Defer — not in v1 |

---

## Design System Changes (`globals.css`)

### New CSS Variables

```css
/* Border radius scale */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 20px;
--radius-pill: 999px;

/* Shadows */
--shadow-card: 0 1px 3px rgba(0,0,0,0.04);
--shadow-card-hover: 0 4px 12px rgba(0,0,0,0.08);
--shadow-drawer: -4px 0 24px rgba(0,0,0,0.12);

/* Transitions */
--transition-fast: 150ms ease;
--transition-normal: 250ms ease;

/* Practice category colors (light mode) */
--category-ecstatic:     #d4913b;   /* amber/warm */
--category-5rhythms:     #b5654a;   /* terracotta */
--category-contact:      #7a9b6d;   /* sage green */
--category-openfloor:    #8b7bb5;   /* soft purple */
--category-biodanza:     #c47a7a;   /* dusty rose */
--category-movement-med: #5b8ea3;   /* teal */
--category-freedance:    #a08b5c;   /* warm gold */
--category-other:        #8a857b;   /* warm grey */
```

Dark mode: category colors slightly desaturated + brightened.

### Typography Refinements

- Card title: `font-weight: 600; font-size: 1.05rem; line-height: 1.3`
- Meta text: `font-size: 0.88rem; line-height: 1.5` (more breathing room)
- Hero heading: `font-family: "Space Grotesk"; font-size: 1.6rem; font-weight: 500`
- Section headings: keep Space Grotesk, generous margin-bottom

---

## Phase 1: Design System (CSS variables, typography, card base)

**Files:** `apps/web/app/globals.css`
**Risk:** Low

- Add new CSS variables (radius, shadows, transitions, category colors)
- Update typography base styles
- Card hover state (`translateY(-1px)`, shadow transition)

---

## Phase 2: Event Card — Horizontal Redesign

**Files:** `apps/web/components/EventSearchClient.tsx`, `globals.css`
**Risk:** Low

### Card Layout

```
+--------------------------------------------------+
| +----------+                                     |
| |          |  Event Title                        |
| | IMAGE or |  Thu, Mar 6 · 18:00-19:00           |
| | FALLBACK |  Berlin, Germany · In person         |
| | 160x120  |  Ocean Dance Collective              |
| |          |                                     |
| +----------+  [Ecstatic Dance]  [English]        |
+--------------------------------------------------+
```

### Image Fallback (no cover image)

- Colored block based on practice category (`--category-*` variable)
- Low-opacity (~30%) DanceResource spiral logo centered in block (CSS `background-image`)
- `border-radius: 10px`

### Card Content Simplifications

- **Date/time:** Concise, no "(your timezone)" text on card face. Clock icon prefix. Timezone as tooltip.
- **Location + attendance:** Single line — "Berlin, Germany · In person" or "Online" or "TBD"
- **Organizer:** Primary name only. "Teacher: Name" or just "Name" (no full role breakdown)
- **Pills:** Practice (colored), language, max 3-4 tags, "+N more" if overflow
- **Remove from card:** subcategory detail, full organizer role breakdown

### Results Grid

- Sidebar hidden (default): 2-column card grid on desktop (>1000px wide content area)
- Sidebar visible: 1-column list
- Mobile: always 1-column, cards go vertical (image top, 16:9)

---

## Phase 3: Results Toolbar + Filter Chips

**Files:** `apps/web/components/EventSearchClient.tsx`, `globals.css`
**Risk:** Low

### Toolbar Layout

```
[ Filters (3) ]     6,884 results     [ Soon ^ ]  [ Recent v ]  [ List / Map ]
-----------------------------------------------------------------------
[ Ecstatic Dance x ]  [ Berlin x ]  [ This weekend x ]  [ Clear all ]
```

- **Filters button:** Left-aligned, shows active filter count badge
- **Result count:** Center, muted
- **Sort + view toggle:** Right-aligned; list/map as segmented pill control
- **Filter chip row:** Below toolbar. Label = value only (no "Dance practice:" prefix). Colored left-border matching category where applicable.
- **"Clear all":** Appears at end of chip row when >0 filters active

---

## Phase 4: Collapsible Sidebar + Mobile Drawer

**Files:** `apps/web/components/EventSearchClient.tsx`, `globals.css`
**Risk:** Medium

### Desktop (>900px)

- Sidebar starts **hidden** — results get full width
- "Filters" button in toolbar toggles sidebar open/closed
- Sidebar slides in from left (CSS transition), pushes content area right
- State persisted in `sessionStorage` (`dr-filters-sidebar-open`)

### Mobile (<900px)

- "Filters" button opens **bottom drawer** (slides up from bottom)
- Drawer covers 85% of viewport height
- Drag handle at top, "Apply" button pinned at bottom
- Background dims with overlay
- Closing without Apply: discards changes (or auto-apply on change — decide during impl)

### Filter Improvements (inside sidebar/drawer)

- **Large sets (Country, 30+ options):** Replace checkboxes with searchable list (type to filter)
- **Small sets (Date, Format, Attendance):** 2-column checkbox grid to reduce height
- **Section headers:** Bold, with count badge when section has active filters; small "clear" link
- **Facet counts:** Keep — they're genuinely useful

---

## Phase 5: Hero Section

**Files:** `apps/web/components/EventSearchClient.tsx`, `apps/web/app/events/page.tsx`, `globals.css`, i18n files
**Risk:** Medium

### Layout

```
+----------------------------------------------------------+
|                                                          |
|             Find your next dance                         |
|                                                          |
|  +--------------------------------------------+  [Search]|
|  |  Search by event, practice, teacher...     |          |
|  +--------------------------------------------+          |
|                                                          |
|  [Ecstatic Dance (2480)]  [5Rhythms (1509)]             |
|  [Contact Improv (1148)]  [This weekend (380)]          |
|  [Online (399)]  [Near you · Berlin]                     |
|                                                          |
|  6,884 events  ·  421 hosts  ·  20+ sources             |
|                                                          |
+----------------------------------------------------------+
```

- Background: `var(--surface-warm)`, subtle bottom border
- Quick pills: auto-populated from taxonomy facets (top 5 practices by count) + "This weekend" + "Near you"
- Stats line from initial search response total + a hosts count
- **Collapse behavior:** When URL has active filters (return visits), hero collapses to search bar only (no pills, no stats). This avoids redundancy when user is mid-search.

---

## Phase 6: "Load More" + Back to Top

**Files:** `apps/web/components/EventSearchClient.tsx`, `globals.css`
**Risk:** Medium

### Load More

```
          -------- Load more --------
              Showing 20 of 6,884
```

- Replaces "Page 1 of 344 · Next" pagination
- Centered outlined button (matches main site's button style)
- Appends next page of results to existing list (no page reload, no scroll jump)
- URL updates `?page=N` incrementally for shareability
- On direct URL load with `?page=3`: loads all pages 1–3 on initial render

### Back to Top

- Fixed `bottom: 24px; right: 24px`, circular button `48px`, shows after scrolling past `800px`
- `↑` arrow, `var(--surface)` background, `var(--line)` border, `var(--shadow-card)` shadow
- Smooth scroll to top of page
- CSS `transition: opacity var(--transition-normal)` fade in/out

---

## Phase 7: Geolocation — "Near you"

**Files:** new `apps/web/lib/useGeolocation.ts`, `apps/web/components/EventSearchClient.tsx`
**Risk:** Medium

### Flow

1. Hero renders "Near you" pill with dashed border (pending state)
2. User clicks pill → `navigator.geolocation.getCurrentPosition()` triggered
3. On success → reverse geocode via existing `/api/geocode` endpoint → get city + countryCode
4. Apply as filters. Pill updates to "Near you · Berlin"
5. Store detected location in `localStorage` (`dr-geolocation`) for return visits
6. On return visits: pill immediately shows "Near you · Belgrade" without re-prompting
7. Graceful degradation: if denied or unavailable, pill disappears silently

### `useGeolocation.ts` hook

```ts
// Returns: { status, city, countryCode, detect }
// status: "idle" | "detecting" | "ready" | "denied" | "unavailable"
```

---

## Phase 8: Hosts Directory

**Files:** hosts page + components, `globals.css`
**Risk:** Medium

Same patterns as events:
- Hero: "Find hosts and teachers" + search + quick pills (top practices, top countries)
- Collapsible sidebar + mobile drawer (same component pattern)
- Host cards redesigned (see below)
- "Load more" pagination

### Host Card (horizontal)

```
+------------------------------------------+
| +--------+  Aaron Lifshin               |
| | AVATAR |  San Francisco, United States |
| | 80x80  |  5Rhythms · teacher           |
| +--------+  [English]                   |
+------------------------------------------+
```

- Avatar: `80x80px`, `border-radius: 50%`, `object-fit: cover`
- Fallback: initials on category-colored background
- Info: name (bold), location, practice + primary role
- Pills: language(s)
- 2-column grid when sidebar hidden, 1-column when visible

---

## Phase 9: Event Detail Page

**Files:** `apps/web/components/EventDetailClient.tsx`, `globals.css`
**Risk:** Low

### Improvements

- **Sticky breadcrumb:** "Events / Event Title" — lets users navigate back
- **Metadata grid:** Structured 2-column grid instead of stacked meta lines:
  ```
  Date + time  |  Location
  Practice     |  Format
  ```
- **Description:** `max-height: 300px` with "Read more" expand toggle for very long descriptions
- **Hosts section:** Use new horizontal host card style
- **Cover image:** Full-width, `max-height: 380px`, `border-radius: var(--radius-md)`, `object-fit: cover`
- **Import disclaimer:** Smaller, no border box — just muted footnote text

---

## Phase 10: Host Detail Page

**Files:** `apps/web/components/OrganizerDetailClient.tsx`, `globals.css`
**Risk:** Low

### Improvements

- **Upcoming events:** Align with new horizontal event card design (smaller version, same structure)
- **Description:** Link detection for raw URLs in bio text
- **Follow/Notify form:** Cleaner layout, better input spacing
- **Tags:** Same pill styling as event cards (colored, consistent)
- **Past events:** Keep list style but align spacing with new card system

---

## Phase 11: Polish + Mobile QA

**Files:** All CSS + components
**Risk:** Low

- Animation pass: card hover, sidebar slide, drawer slide, pill transitions
- Mobile QA on events, hosts, detail pages
- Typography QA: check line lengths, overflow, truncation
- Dark mode QA pass on all new elements
- Accessibility: keyboard nav through filters, focus states, aria-labels on new controls
- Performance: ensure no layout shift from sidebar toggle, lazy load images

---

## Deployment Strategy

Each phase is independently deployable via `bash scripts/quick-deploy-web.sh` (CSS/HTML/JS changes, ~110s).

Phases that add dependencies or API changes: use `npm run bg:deploy -- main` (~210s).

None of the planned phases require API or database changes.

---

## Files Changed Summary

| File | Phases |
|------|--------|
| `apps/web/app/globals.css` | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| `apps/web/components/EventSearchClient.tsx` | 2, 3, 4, 5, 6, 7 |
| `apps/web/app/events/page.tsx` | 5 |
| `apps/web/lib/useGeolocation.ts` | 7 (new file) |
| `apps/web/components/LeafletClusterMap.tsx` | 11 (minor) |
| `apps/web/components/layout/AppShell.tsx` | 11 (minor) |
| Hosts page + components | 8 |
| `apps/web/components/EventDetailClient.tsx` | 9 |
| `apps/web/components/OrganizerDetailClient.tsx` | 10 |
| `apps/web/i18n/messages/en.json` | 5, 7 |
| `apps/web/i18n/messages/sr-Latn.json` | 5, 7 |
