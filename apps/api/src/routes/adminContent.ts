import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  getAdminEventById,
  getAdminOrganizerById,
  listAdminEvents,
  listAdminOrganizers,
} from "../db/adminRepo";
import { recordActivity } from "../services/activityLogger";
import { syncSeriesAfterHardDelete } from "../services/eventLifecycleService";
import { getEventById, setEventOrganizersByRoleKey } from "../db/eventRepo";
import { createLocation } from "../db/locationRepo";
import { listManagedEvents, listManagedOrganizers, getEventFacets, getHostFacets } from "../db/manageRepo";
import {
  createOrganizer,
  deleteOrganizer,
  getOrganizerByExternalRef,
  getOrganizerRelated,
  updateOrganizer,
} from "../db/organizerRepo";
import { resolveUserId, requireEventAccess, requireOrganizerAccess } from "../middleware/ownership";
import { geocodeSearch } from "../services/geocodeService";
import { clearSearchCache } from "../services/searchCache";
import { logValidation } from "../utils/validationError";

const eventQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  visibility: z.enum(["public", "unlisted"]).optional(),
  showUnlisted: z.coerce.boolean().optional(),
  externalSource: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
  organizerId: z.string().uuid().optional(),
  practiceCategoryId: z.string().optional(),
  eventFormatId: z.string().optional(),
  ownerFilter: z.enum(["all", "unassigned", "has_owner"]).optional(),
  sourceFilter: z.enum(["imported", "manual", "detached"]).optional(),
  countryCode: z.string().optional(),
  attendanceMode: z.string().optional(),
  languages: z.string().optional(),
  cities: z.string().optional(),
  tags: z.string().optional(),
  time: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasReports: z.coerce.boolean().optional(),
  hasSaves: z.coerce.boolean().optional(),
  hasRsvps: z.coerce.boolean().optional(),
  hasComments: z.coerce.boolean().optional(),
  sort: z.string().optional(),
  managedBy: z.enum(["me"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const organizerQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  showArchived: z.coerce.boolean().optional(),
  practiceCategoryId: z.string().optional(),
  profileRoleId: z.string().optional(),
  countryCode: z.string().optional(),
  languages: z.string().optional(),
  cities: z.string().optional(),
  sourceFilter: z.enum(["imported", "manual", "detached"]).optional(),
  hasReports: z.coerce.boolean().optional(),
  sort: z.string().optional(),
  managedBy: z.enum(["me"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const upsertOrganizerExternalSchema = z.object({
  externalSource: z.string().trim().min(1).max(255),
  externalId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().url().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  descriptionHtml: z.string().max(100000).nullable().optional(),
  descriptionJson: z.record(z.any()).optional(),
  tags: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(2).max(16)).default([]),
  profileRoleIds: z.array(z.string().uuid()).optional(),
  practiceCategoryIds: z.array(z.string().uuid()).optional(),
  locations: z.array(z.object({
    id: z.string().uuid().optional(),
    externalSource: z.string().max(255).nullable().optional(),
    externalId: z.string().max(255).nullable().optional(),
    isPrimary: z.boolean().optional(),
    label: z.string().max(255).nullable().optional(),
    formattedAddress: z.string().max(500).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    countryCode: z.string().min(2).max(8).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    provider: z.string().max(64).nullable().optional(),
    placeId: z.string().max(255).nullable().optional(),
  })).optional(),
  primaryLocationId: z.string().uuid().nullable().optional(),
  city: z.string().trim().min(1).max(120).nullable().optional(),
  countryCode: z.string().trim().min(2).max(8).nullable().optional(),
  status: z.enum(["published", "draft", "archived"]).default("published"),
});

const replaceEventOrganizersSchema = z.array(z.object({
  organizerId: z.string().uuid(),
  roleKey: z.string().trim().min(1),
  displayOrder: z.number().int().default(0),
}));

const createLocationBaseSchema = z.object({
  type: z.enum(["physical", "online"]).default("physical"),
  name: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(200).optional(),
  formattedAddress: z.string().min(1).max(500).optional(),
  countryCode: z.string().min(2).max(8).optional(),
  city: z.string().max(120).nullish(),
  fingerprint: z.string().min(1).max(500).optional(),
  lat: z.number().gte(-90).lte(90).nullable().optional(),
  lng: z.number().gte(-180).lte(180).nullable().optional(),
});

const createLocationSchema = createLocationBaseSchema
  .refine(
    (value) => (
      (value.lat === undefined && value.lng === undefined)
      || (value.lat === null && value.lng === null)
      || (typeof value.lat === "number" && typeof value.lng === "number")
    ),
    {
      message: "lat and lng must be provided together",
      path: ["lat"],
    },
  )
  .refine(
    (value) => {
      if (value.type !== "online") {
        return true;
      }

      return (
        (value.lat === undefined && value.lng === undefined)
        || (value.lat === null && value.lng === null)
      );
    },
    {
      message: "online locations cannot include lat/lng",
      path: ["lat"],
    },
  )
  .refine(
    (value) => {
      if (value.type === "online") {
        return Boolean(value.name || value.label);
      }

      return Boolean(value.label || value.formattedAddress || value.city || value.countryCode);
    },
    {
      message: "physical requires at least one of label/formattedAddress/city/countryCode; online requires name",
      path: ["type"],
    },
  );

const adminContentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/events/facets", async (request, reply) => {
    await app.requireEditor(request);
    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);
    const q = request.query as Record<string, string>;
    const csv = (v?: string) => v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    return reply.send(await getEventFacets(app.db, userId, {
      status: csv(q.status),
      visibility: csv(q.visibility),
      practiceCategoryIds: csv(q.practiceCategoryId),
      attendanceModes: csv(q.attendanceMode),
      eventFormatIds: csv(q.eventFormatId),
      languages: csv(q.languages),
      countryCodes: csv(q.countryCode).map((c) => c.toUpperCase()),
      cities: csv(q.cities),
      tags: csv(q.tags),
    }));
  });

  app.get("/admin/organizers/facets", async (request, reply) => {
    await app.requireEditor(request);
    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);
    const q = request.query as Record<string, string>;
    const csv = (v?: string) => v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    return reply.send(await getHostFacets(app.db, userId, {
      status: q.status || undefined,
      practiceCategoryIds: csv(q.practiceCategoryId),
      roleIds: csv(q.profileRoleId),
      languages: csv(q.languages),
      countryCodes: csv(q.countryCode).map((c) => c.toUpperCase()),
      cities: csv(q.cities),
    }));
  });

  app.get("/admin/events", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = eventQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    if (
      (parsed.data.externalSource && !parsed.data.externalId) ||
      (!parsed.data.externalSource && parsed.data.externalId)
    ) {
      reply.code(400);
      return { error: "externalSource and externalId must be provided together" };
    }

    if (parsed.data.managedBy === "me") {
      const auth = request.auth!;
      const userId = await resolveUserId(app.db, auth);
      return listManagedEvents(app.db, userId, {
        q: parsed.data.q,
        status: parsed.data.status,
        visibility: parsed.data.visibility,
        practiceCategoryId: parsed.data.practiceCategoryId,
        eventFormatId: parsed.data.eventFormatId,
        countryCode: parsed.data.countryCode,
        attendanceMode: parsed.data.attendanceMode,
        languages: parsed.data.languages,
        cities: parsed.data.cities,
        tags: parsed.data.tags,
        time: parsed.data.time,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        sort: parsed.data.sort,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      });
    }

    return listAdminEvents(app.db, {
      ...parsed.data,
      status: parsed.data.status,
      organizerId: parsed.data.organizerId,
      ownerFilter: parsed.data.ownerFilter,
      sourceFilter: parsed.data.sourceFilter,
      time: (parsed.data.time === "upcoming" || parsed.data.time === "past") ? parsed.data.time : undefined,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      sort: parsed.data.sort,
    });
  });

  app.get("/admin/organizers", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = organizerQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    if (parsed.data.managedBy === "me") {
      const auth = request.auth!;
      const userId = await resolveUserId(app.db, auth);
      return listManagedOrganizers(app.db, userId, {
        q: parsed.data.q,
        status: parsed.data.status,
        practiceCategoryId: parsed.data.practiceCategoryId,
        profileRoleId: parsed.data.profileRoleId,
        countryCode: parsed.data.countryCode,
        languages: parsed.data.languages,
        cities: parsed.data.cities,
        sort: parsed.data.sort,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      });
    }

    return listAdminOrganizers(app.db, {
      ...parsed.data,
      status: parsed.data.status ?? (parsed.data.showArchived ? undefined : "published"),
      practiceCategoryId: parsed.data.practiceCategoryId,
      profileRoleId: parsed.data.profileRoleId,
      countryCode: parsed.data.countryCode,
      sort: parsed.data.sort,
    });
  });

  app.get("/admin/events/distinct-cities", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ city: string }>(
      `SELECT DISTINCT l.city FROM event_locations el JOIN locations l ON l.id = el.location_id WHERE l.city IS NOT NULL AND l.city != '' ORDER BY l.city`,
    );
    return { items: result.rows.map((r) => r.city) };
  });

  app.get("/admin/events/distinct-tags", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ tag: string }>(
      `SELECT DISTINCT unnest(tags) AS tag FROM events WHERE tags IS NOT NULL AND array_length(tags, 1) > 0 ORDER BY tag`,
    );
    return { items: result.rows.map((r) => r.tag) };
  });

  app.get("/admin/events/distinct-languages", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ lang: string }>(
      `SELECT DISTINCT unnest(languages) AS lang FROM events WHERE languages IS NOT NULL AND array_length(languages, 1) > 0 ORDER BY lang`,
    );
    return { items: result.rows.map((r) => r.lang) };
  });

  app.get("/admin/events/distinct-countries", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ country_code: string }>(
      `SELECT DISTINCT upper(l.country_code) AS country_code FROM event_locations el JOIN locations l ON l.id = el.location_id WHERE l.country_code IS NOT NULL AND l.country_code != '' ORDER BY country_code`,
    );
    return { items: result.rows.map((r) => r.country_code) };
  });

  app.get("/admin/organizers/distinct-languages", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ lang: string }>(
      `SELECT DISTINCT unnest(languages) AS lang FROM organizers WHERE languages IS NOT NULL AND array_length(languages, 1) > 0 ORDER BY lang`,
    );
    return { items: result.rows.map((r) => r.lang) };
  });

  app.get("/admin/organizers/distinct-countries", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ country_code: string }>(
      `SELECT DISTINCT upper(country_code) AS country_code FROM organizers WHERE country_code IS NOT NULL AND country_code != '' ORDER BY country_code`,
    );
    return { items: result.rows.map((r) => r.country_code) };
  });

  app.get("/admin/organizers/distinct-cities", async (request) => {
    await app.requireEditor(request);
    const result = await app.db.query<{ city: string }>(
      `SELECT DISTINCT city FROM organizer_locations WHERE city IS NOT NULL AND city != '' ORDER BY city`,
    );
    return { items: result.rows.map((r) => r.city) };
  });

  app.get("/admin/events/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    const item = await getAdminEventById(app.db, params.data.id);
    if (!item) {
      reply.code(404);
      return { error: "not_found" };
    }

    return item;
  });

  app.get("/admin/organizers/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireOrganizerAccess(app.db, userId, params.data.id, false);
    }

    const item = await getAdminOrganizerById(app.db, params.data.id);
    if (!item) {
      reply.code(404);
      return { error: "not_found" };
    }

    return item;
  });

  app.post("/admin/locations", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = createLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const created = await createLocation(app.db, parsed.data as never);
    reply.code(201);
    return created;
  });

  app.get("/admin/geocode/search", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = z.object({
      q: z.string().trim().min(2),
      limit: z.coerce.number().int().positive().max(10).default(8),
    }).safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    return geocodeSearch(app.db, parsed.data.q, parsed.data.limit);
  });

  app.post("/admin/organizers/upsert-external", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = upsertOrganizerExternalSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const existing = await getOrganizerByExternalRef(
      app.db,
      parsed.data.externalSource,
      parsed.data.externalId,
    );
    if (existing && existing.detached_from_import) {
      // Host was claimed/edited by a human editor; importer must not overwrite.
      recordActivity(app.db, request, {
        action: "host.import_skip_detached",
        targetType: "host",
        targetId: existing.id,
        targetLabel: existing.name,
        metadata: {
          via: "external_import",
          externalSource: parsed.data.externalSource,
          externalId: parsed.data.externalId,
        },
      });
      return {
        id: existing.id,
        slug: existing.slug,
        created: false,
        skipped: "detached" as const,
      };
    }
    if (existing) {
      const updated = await updateOrganizer(app.db, existing.id, {
        name: parsed.data.name,
        websiteUrl: parsed.data.websiteUrl ?? null,
        externalUrl: parsed.data.externalUrl ?? null,
        descriptionJson: parsed.data.descriptionJson ?? {},
        descriptionHtml: parsed.data.descriptionHtml ?? null,
        tags: parsed.data.tags,
        languages: parsed.data.languages,
        imageUrl: parsed.data.imageUrl ?? null,
        avatarPath: parsed.data.imageUrl ?? null,
        city: parsed.data.city ?? null,
        countryCode: parsed.data.countryCode ?? null,
        profileRoleIds: parsed.data.profileRoleIds,
        practiceCategoryIds: parsed.data.practiceCategoryIds,
        locations: parsed.data.locations,
        primaryLocationId: parsed.data.primaryLocationId,
        status: parsed.data.status,
        externalSource: parsed.data.externalSource,
        externalId: parsed.data.externalId,
      });
      clearSearchCache();
      recordActivity(app.db, request, {
        action: "host.edit",
        targetType: "host",
        targetId: updated?.id ?? existing.id,
        targetLabel: parsed.data.name,
        metadata: { via: "external_import", externalSource: parsed.data.externalSource, externalId: parsed.data.externalId },
      });
      return {
        id: updated?.id ?? existing.id,
        slug: updated?.slug ?? existing.slug,
        created: false,
      };
    }

    const created = await createOrganizer(app.db, {
      name: parsed.data.name,
      websiteUrl: parsed.data.websiteUrl ?? null,
      externalUrl: parsed.data.externalUrl ?? null,
      descriptionJson: parsed.data.descriptionJson ?? {},
      descriptionHtml: parsed.data.descriptionHtml ?? null,
      tags: parsed.data.tags,
      languages: parsed.data.languages,
      status: parsed.data.status,
      imageUrl: parsed.data.imageUrl ?? null,
      avatarPath: parsed.data.imageUrl ?? null,
      city: parsed.data.city ?? null,
      countryCode: parsed.data.countryCode ?? null,
      profileRoleIds: parsed.data.profileRoleIds,
      practiceCategoryIds: parsed.data.practiceCategoryIds,
      locations: parsed.data.locations,
      primaryLocationId: parsed.data.primaryLocationId,
      externalSource: parsed.data.externalSource,
      externalId: parsed.data.externalId,
    });
    clearSearchCache();
    recordActivity(app.db, request, {
      action: "host.create",
      targetType: "host",
      targetId: created.id,
      targetLabel: parsed.data.name,
      metadata: { via: "external_import", externalSource: parsed.data.externalSource, externalId: parsed.data.externalId },
    });
    reply.code(201);
    return { id: created.id, slug: created.slug, created: true };
  });

  app.post("/admin/events/:id/organizers/replace", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }
    const parsed = replaceEventOrganizersSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const event = await getEventById(app.db, params.data.id);
    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }

    const result = await setEventOrganizersByRoleKey(app.db, event.id, parsed.data);
    if (!result.ok) {
      reply.code(400);
      return {
        error: "unknown_role_key",
        missingRoleKeys: result.missingRoleKeys,
      };
    }
    recordActivity(app.db, request, {
      action: "ownership.replace",
      targetType: "event",
      targetId: event.id,
      targetLabel: event.title,
      metadata: { organizers: parsed.data },
    });
    return { ok: true };
  });

  app.delete("/admin/events/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const exists = await app.db.query<{ id: string }>(
      `select id from events where id = $1`,
      [params.data.id],
    );
    if (!exists.rowCount) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Snapshot before deletion
    const eventSnap = await getEventById(app.db, params.data.id);
    // Capture series_id before the DELETE so we can refresh event_series
    // after the parent row is gone. The remaining siblings (if any) may
    // still back a valid series — we need the row rebuilt or dropped.
    const seriesId = eventSnap?.series_id ?? null;
    recordActivity(app.db, request, {
      action: "event.delete",
      targetType: "event",
      targetId: params.data.id,
      targetLabel: eventSnap?.title ?? null,
      snapshot: eventSnap as unknown as Record<string, unknown>,
    });

    // Delete event and related data
    await app.db.query(`delete from event_occurrences where event_id = $1`, [params.data.id]);
    await app.db.query(`delete from event_organizers where event_id = $1`, [params.data.id]);
    await app.db.query(`delete from event_locations where event_id = $1`, [params.data.id]);
    await app.db.query(`delete from event_users where event_id = $1`, [params.data.id]);
    await app.db.query(`delete from events where id = $1`, [params.data.id]);

    // Remove from Meilisearch
    try {
      await app.meiliService.deleteOccurrencesByEventId(params.data.id);
    } catch { /* ignore */ }
    if (seriesId) {
      await syncSeriesAfterHardDelete(app.db, app.meiliService, seriesId);
    }
    clearSearchCache();

    reply.code(204);
  });

  app.delete("/admin/organizers/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
    }

    const query = z.object({ dry: z.coerce.boolean().default(false) }).safeParse(request.query);

    if (query.success && query.data.dry) {
      const related = await getOrganizerRelated(app.db, params.data.id);
      // If organizer doesn't exist, all lists will be empty — signal not_found
      const exists = await app.db.query<{ id: string }>(
        `select id from organizers where id = $1`,
        [params.data.id],
      );
      if (!exists.rowCount) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { dryRun: true, related };
    }

    // Snapshot before deletion
    const hostSnap = await getAdminOrganizerById(app.db, params.data.id);
    const { found, affectedEventIds } = await deleteOrganizer(app.db, params.data.id);
    if (!found) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Resync affected events in Meilisearch (organizer names may have changed)
    if (affectedEventIds.length > 0) {
      await Promise.all(
        affectedEventIds.map((eventId) =>
          app.meiliService.upsertOccurrencesForEvent(app.db, eventId).catch(() => {}),
        ),
      );
      clearSearchCache();
    }

    recordActivity(app.db, request, {
      action: "host.delete",
      targetType: "host",
      targetId: params.data.id,
      targetLabel: hostSnap?.name ?? null,
      snapshot: hostSnap as unknown as Record<string, unknown>,
    });

    reply.code(204);
  });
};

export default adminContentRoutes;
