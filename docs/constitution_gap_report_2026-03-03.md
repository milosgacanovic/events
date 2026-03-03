# Constitution Gap Report (2026-03-03)

Scope: Evidence-based audit against [`constitution.md`](/opt/events/constitution.md) with no feature/code changes.

## 1) Purpose and Hard Scope Boundary — 🟨 PARTIAL
- Evidence:
  - Public discovery stack exists: [`apps/web/components/EventSearchClient.tsx`](/opt/events/apps/web/components/EventSearchClient.tsx), [`apps/web/components/LeafletClusterMap.tsx`](/opt/events/apps/web/components/LeafletClusterMap.tsx)
  - Editor/admin auth and actions exist: [`apps/api/src/index.ts`](/opt/events/apps/api/src/index.ts) (`requireEditor`, `requireAdmin`), [`apps/api/src/routes/events.ts`](/opt/events/apps/api/src/routes/events.ts)
  - Importer remains separate repo (not in `/opt/events`) and platform side only exposes contracts/docs.
- Behavior that exists:
  - Discovery via list + map + facets is implemented.
  - Host terminology is used in UI while `organizers` naming remains in DB/API.
- Missing / gap:
  - No in-repo measurable benchmark proving the 10k–100k occurrence scaling target under load.
- Risk: **medium** (performance assumptions may fail at growth points).
- Suggested next action:
  - Add a repeatable load profile for `/api/events/search` and `/api/map/clusters` in runbook.
  - Add p95 latency SLO targets and a script to measure them before release.

## 2) Product Requirements — 🟨 PARTIAL
- Evidence:
  - Events list/map + facets: [`apps/web/components/EventSearchClient.tsx`](/opt/events/apps/web/components/EventSearchClient.tsx)
  - Event detail (cover, description, hosts, occurrences, map): [`apps/web/components/EventDetailClient.tsx`](/opt/events/apps/web/components/EventDetailClient.tsx)
  - Host directory/detail: [`apps/web/components/OrganizerSearchClient.tsx`](/opt/events/apps/web/components/OrganizerSearchClient.tsx), [`apps/web/components/OrganizerDetailClient.tsx`](/opt/events/apps/web/components/OrganizerDetailClient.tsx)
  - Editor/admin CRUD + lifecycle: [`apps/api/src/routes/events.ts`](/opt/events/apps/api/src/routes/events.ts), [`apps/api/src/routes/organizers.ts`](/opt/events/apps/api/src/routes/organizers.ts), [`apps/web/components/admin/AdminConsole.tsx`](/opt/events/apps/web/components/admin/AdminConsole.tsx)
- Behavior that exists:
  - Public search/detail/host flows are live.
  - Editor/admin can create/edit/publish/unpublish/cancel events and attach multiple hosts with roles.
- Missing / gap:
  - Explicit archive moderation workflow in admin UX is not clearly exposed as a dedicated operator action.
  - Optional autosave draft behavior is not evident as an explicit 10s autosave loop in admin forms.
- Risk: **medium** (operator friction, inconsistent content lifecycle handling).
- Suggested next action:
  - Add explicit archive/unarchive controls in admin event and organizer editors.
  - Add autosave status loop for admin draft forms or document deliberate deferral.

## 3) Architecture Decisions (MVP) — ✅ DONE
- Evidence:
  - Stack and wiring: [`apps/api/src/index.ts`](/opt/events/apps/api/src/index.ts), [`apps/web/app/layout.tsx`](/opt/events/apps/web/app/layout.tsx)
  - Occurrence model: [`apps/api/src/services/occurrenceService.ts`](/opt/events/apps/api/src/services/occurrenceService.ts), [`apps/api/src/services/eventLifecycleService.ts`](/opt/events/apps/api/src/services/eventLifecycleService.ts)
  - Meili usage: [`apps/api/src/services/meiliService.ts`](/opt/events/apps/api/src/services/meiliService.ts)
  - Map clustering: [`apps/api/src/services/mapClusterService.ts`](/opt/events/apps/api/src/services/mapClusterService.ts)
- Behavior that exists:
  - Monorepo TS setup with Next.js + Fastify + Postgres/PostGIS + Meilisearch + supercluster + Keycloak JWT.
  - Occurrence-first search/map architecture implemented.
- Missing / gap:
  - None critical against constitution architectural choices.
- Risk: **low**.
- Suggested next action:
  - Keep architecture ADRs updated in [`docs/decisions.md`](/opt/events/docs/decisions.md) as deviations occur.

## 4) Data Model — 🟨 PARTIAL
- Evidence:
  - Baseline schema: [`db/migrations/001_init.sql`](/opt/events/db/migrations/001_init.sql)
  - UI labels table: [`db/migrations/002_ui_labels.sql`](/opt/events/db/migrations/002_ui_labels.sql)
  - External refs and idempotency keys: [`db/migrations/003_event_external_ref.sql`](/opt/events/db/migrations/003_event_external_ref.sql), [`db/migrations/011_organizers_external_ref.sql`](/opt/events/db/migrations/011_organizers_external_ref.sql)
  - Event format and constraints: [`db/migrations/008_event_format.sql`](/opt/events/db/migrations/008_event_format.sql), [`db/migrations/009_event_format_not_null.sql`](/opt/events/db/migrations/009_event_format_not_null.sql)
- Behavior that exists:
  - All constitution core tables exist (users, organizers, organizer_roles, organizer_locations, practices, events, locations, event_locations, event_organizers, event_occurrences, geocode_cache).
  - Required indexes and schedule shape checks are present.
- Missing / gap:
  - Model has evolved beyond constitution (e.g., `event_formats`, `is_imported`, `user_alerts`) and constitution doc is not fully synchronized to current schema extensions.
- Risk: **medium** (doc/schema drift creates integration confusion).
- Suggested next action:
  - Add a schema delta appendix in constitution or docs/api.md.
  - Document non-MVP additive tables/columns as approved extensions.

## 5) Search (Meilisearch + Facets) — 🟨 PARTIAL
- Evidence:
  - Search route: [`apps/api/src/routes/events.ts`](/opt/events/apps/api/src/routes/events.ts) (`app.get("/events/search")`)
  - Fallback DB search: [`apps/api/src/db/eventRepo.ts`](/opt/events/apps/api/src/db/eventRepo.ts) (`searchEventsFallback`)
  - Meili index settings/docs fields: [`apps/api/src/services/meiliService.ts`](/opt/events/apps/api/src/services/meiliService.ts)
  - Web filters/facets: [`apps/web/components/EventSearchClient.tsx`](/opt/events/apps/web/components/EventSearchClient.tsx)
- Behavior that exists:
  - Faceted search with pagination/sort/filter and fallback path.
  - Filterable/sortable attributes configured.
  - `description_text` extraction is indexed.
- Missing / gap:
  - Constitution says default `to=now+90d` for `/events/search`; implementation default is `now+365d` in route logic.
- Risk: **medium** (contract mismatch for integrators/SEO expectations).
- Suggested next action:
  - Align constitution text to current behavior (or change API default if product requires 90d).
  - Add an explicit contract test for default date window.

## 6) Map Clustering — ✅ DONE
- Evidence:
  - Route: [`apps/api/src/routes/map.ts`](/opt/events/apps/api/src/routes/map.ts)
  - DB query helper: [`apps/api/src/db/mapRepo.ts`](/opt/events/apps/api/src/db/mapRepo.ts)
  - Clustering service: [`apps/api/src/services/mapClusterService.ts`](/opt/events/apps/api/src/services/mapClusterService.ts)
  - Web map UI: [`apps/web/components/LeafletClusterMap.tsx`](/opt/events/apps/web/components/LeafletClusterMap.tsx)
  - API tests: [`apps/api/src/routes/map.test.ts`](/opt/events/apps/api/src/routes/map.test.ts)
- Behavior that exists:
  - Bbox+zoom cluster API using supercluster with LRU cache (30s).
  - Geo-only occurrences, published-only filters, and map interaction wiring.
- Missing / gap:
  - None critical against constitution map MVP.
- Risk: **low**.
- Suggested next action:
  - Add map-specific latency tracking to release gate for large bboxes.

## 7) Auth / RBAC — ✅ DONE
- Evidence:
  - JWT verification and role mapping: [`apps/api/src/services/authService.ts`](/opt/events/apps/api/src/services/authService.ts)
  - Route guards: [`apps/api/src/index.ts`](/opt/events/apps/api/src/index.ts) (`requireEditor`, `requireAdmin`)
  - SSO UX: [`apps/web/components/auth/KeycloakAuthProvider.tsx`](/opt/events/apps/web/components/auth/KeycloakAuthProvider.tsx)
- Behavior that exists:
  - JWT issuer/audience verification via JWKS.
  - Role extraction from realm/client roles; editor/admin enforcement on protected routes.
- Missing / gap:
  - No critical constitutional RBAC gap identified.
- Risk: **low**.
- Suggested next action:
  - Add token clock-skew handling tests if Keycloak expiry edge cases appear.

## 8) Uploads — ✅ DONE
- Evidence:
  - Upload route and MIME sniffing: [`apps/api/src/routes/uploads.ts`](/opt/events/apps/api/src/routes/uploads.ts)
  - Static serving under `/uploads`: [`apps/api/src/index.ts`](/opt/events/apps/api/src/index.ts)
- Behavior that exists:
  - Editor-protected upload endpoint.
  - Size limit, MIME signature checks (`jpeg/png/webp`), controlled path layout, cache header.
- Missing / gap:
  - None critical against constitution upload MVP.
- Risk: **low**.
- Suggested next action:
  - Add malware scanning/AV hook as future hardening (non-MVP).

## 9) Admin — 🟨 PARTIAL
- Evidence:
  - Admin API routes: [`apps/api/src/routes/admin.ts`](/opt/events/apps/api/src/routes/admin.ts), [`apps/api/src/routes/adminContent.ts`](/opt/events/apps/api/src/routes/adminContent.ts)
  - Admin UI with left sidebar sections: [`apps/web/components/admin/AdminConsole.tsx`](/opt/events/apps/web/components/admin/AdminConsole.tsx) (`admin-shell`, `section` query sync)
  - Detail page edit CTA: [`apps/web/components/EventDetailClient.tsx`](/opt/events/apps/web/components/EventDetailClient.tsx)
- Behavior that exists:
  - Sidebar sections (Events, Organizers, Taxonomies, Users) and deep-link section selection.
  - Taxonomy CRUD and UI label management.
- Missing / gap:
  - Some section views still mix dense form/list blocks; “single-page per section” intent is only partially realized from IA/clarity perspective.
- Risk: **medium** (admin usability and operator error risk).
- Suggested next action:
  - Split heavy section content into clearer subpanels with explicit task flows.
  - Add section-specific success/error summaries and guardrails.

## 10) i18n — 🟨 PARTIAL
- Evidence:
  - Provider/catalog wiring: [`apps/web/components/i18n/I18nProvider.tsx`](/opt/events/apps/web/components/i18n/I18nProvider.tsx), [`apps/web/lib/i18n/messages.ts`](/opt/events/apps/web/lib/i18n/messages.ts)
  - Catalogs: [`apps/web/i18n/messages/en.json`](/opt/events/apps/web/i18n/messages/en.json), [`apps/web/i18n/messages/sr-Latn.json`](/opt/events/apps/web/i18n/messages/sr-Latn.json)
  - Locale selection: [`apps/web/components/i18n/LocaleSwitcher.tsx`](/opt/events/apps/web/components/i18n/LocaleSwitcher.tsx)
- Behavior that exists:
  - BCP47 locale handling and ICU message formatting.
  - Two shipped locales with default locale behavior.
- Missing / gap:
  - Constitution requires all user-facing strings via catalogs; current repo likely still has scattered hardcoded UI literals (especially in secondary/legacy admin branches) that are not guaranteed fully cataloged.
- Risk: **medium** (translation incompleteness and inconsistent UX across locales).
- Suggested next action:
  - Run a targeted string-lint audit for uncataloged literals in `apps/web/components`.
  - Add CI check to block new uncataloged user-facing strings.

## 11) Ops — 🟨 PARTIAL
- Evidence:
  - Health endpoint with DB/Meili counts: [`apps/api/src/routes/health.ts`](/opt/events/apps/api/src/routes/health.ts)
  - Structured logging/request id: [`apps/api/src/index.ts`](/opt/events/apps/api/src/index.ts)
  - Deploy assets: [`deploy/docker/docker-compose.yml`](/opt/events/deploy/docker/docker-compose.yml), [`deploy/apache/beta.events.danceresource.org.conf`](/opt/events/deploy/apache/beta.events.danceresource.org.conf)
  - Runbook and gates: [`docs/runbook.md`](/opt/events/docs/runbook.md), [`scripts/releaseGate.ts`](/opt/events/scripts/releaseGate.ts)
- Behavior that exists:
  - Operational runbook, release gate, Meili reset/backup scripts, health and security headers.
- Missing / gap:
  - No documented blue/green or zero-downtime deployment flow yet.
  - No explicit alerting/on-call thresholds documented for API/search/map latency.
- Risk: **high** (deployment and incident response maturity).
- Suggested next action:
  - Add deployment strategy section (current rolling + target blue/green) with rollback steps.
  - Add basic SLO/alert thresholds to runbook.

## 12) Testing — 🟨 PARTIAL
- Evidence:
  - API test suite files: [`apps/api/src/routes/events.idempotency.test.ts`](/opt/events/apps/api/src/routes/events.idempotency.test.ts), [`apps/api/src/routes/map.test.ts`](/opt/events/apps/api/src/routes/map.test.ts), [`apps/api/src/services/occurrenceService.test.ts`](/opt/events/apps/api/src/services/occurrenceService.test.ts), [`apps/api/src/services/authService.test.ts`](/opt/events/apps/api/src/services/authService.test.ts), [`apps/api/src/middleware/rateLimit.test.ts`](/opt/events/apps/api/src/middleware/rateLimit.test.ts)
  - Release gate: [`scripts/releaseGate.ts`](/opt/events/scripts/releaseGate.ts)
- Behavior that exists:
  - Strong unit/integration-style API coverage for idempotency, auth, health, metrics, map contract, and occurrence lifecycle.
- Missing / gap:
  - Constitution asks for web smoke tests; no dedicated automated web smoke/e2e test suite is present in repo.
  - No explicit dockerized integration test stage validating live Meili indexing end-to-end under CI.
- Risk: **medium** (regressions in UI or full-stack flows may slip).
- Suggested next action:
  - Add minimal Playwright smoke tests for `/events`, `/events/[slug]`, `/organizers`.
  - Add one CI job for containerized API+DB+Meili integration smoke.

---

## Top 10 Highest-Leverage Gaps (User-Facing)
1. Full i18n completion audit and CI guard for uncataloged strings.
2. Admin UX simplification for section-specific workflows (reduce operator friction).
3. Clarify and standardize archive/unarchive UX across events and organizers.
4. Add web smoke/e2e tests for primary discovery flows.
5. Harmonize constitution/API default event search window (90 vs 365 days) to avoid user confusion.
6. Improve map empty/truncation explanatory UX with actionable hints (zoom/filter suggestions).
7. Add clearer admin lifecycle status indicators for publish/unpublish/cancel/archive actions.
8. Formalize timezone display policy in docs and align all pages/components.
9. Add user-facing error normalization for API validation errors across forms.
10. Expand organizer profile completeness guidance (image/bio/location quality guardrails).

## Top 10 Highest-Risk Gaps (Operational/Security/Data Integrity)
1. Missing documented blue/green deployment and rollback runbook.
2. Lack of explicit latency/error SLOs and alert thresholds in operations docs.
3. Contract drift risk between constitution and live API defaults (search window semantics).
4. No automated end-to-end containerized indexing test in CI.
5. Limited automated UI smoke tests for critical routes.
6. Potential translation drift without CI string governance.
7. Admin workflow complexity may increase content lifecycle mistakes.
8. Lack of formal capacity test harness for high-cardinality map/search scenarios.
9. Upload hardening lacks malware scanning stage (future hardening item).
10. Schema/doc evolution outpacing constitution updates (integration onboarding risk).

## Recommended 1-Week Execution Plan (5 Workdays)
### Day 1 — Contract + Ops Alignment
- Align constitution vs live API defaults (especially `/events/search` date window).
- Update runbook with explicit deploy rollback sequence and outage expectations.

### Day 2 — Testing Foundation
- Add minimal web smoke tests for `/events`, `/events/[slug]`, `/organizers`.
- Add CI target for smoke execution against built web/api.

### Day 3 — Full-Stack Integration Gate
- Add containerized integration smoke for API+Postgres+Meili indexing parity.
- Wire pass/fail to release readiness docs.

### Day 4 — Admin and i18n Risk Reduction
- Tighten admin section task-flow clarity (status messaging, lifecycle actions).
- Run literal-string audit and catalog missing i18n keys.

### Day 5 — Performance + Policy Hardening
- Add repeatable search/map latency benchmark script and baseline thresholds.
- Publish timezone display policy and ensure page-level consistency checklist.

