import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from "@dr-events/shared";
import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import {
  createEvent,
  getEventById,
  getEventByExternalRef,
  getEventBySlug,
  searchEventsFallback,
  setEventOrganizers,
  updateEvent,
} from "../db/eventRepo";
import { getEventDefaultLocation, setEventDefaultLocation } from "../db/locationRepo";
import { findOrCreateUserBySub } from "../db/userRepo";
import { cancelEvent, publishEvent, regenerateOccurrences, unpublishEvent } from "../services/eventLifecycleService";
import { OCCURRENCES_INDEX, type OccurrenceDoc } from "../services/meiliService";
import { recordPublish, recordSearchDuration } from "../services/metricsStore";
import { getSearchCache, setSearchCache } from "../services/searchCache";

const searchQuerySchema = z.object({
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  includePast: z.enum(["true", "false"]).optional(),
  practiceCategoryId: z.string().optional(),
  practice: z.string().optional(),
  practiceSubcategoryId: z.string().uuid().optional(),
  eventFormatId: z.string().optional(),
  format: z.string().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  attendanceMode: z.enum(["in_person", "online", "hybrid"]).optional(),
  organizerId: z.string().uuid().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  hasGeo: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  sort: z.enum(["date_asc", "date_desc", "startsAtAsc", "startsAtDesc", "publishedAtDesc"]).default("date_asc"),
});

function isExternalRefConflict(error: unknown): boolean {
  const value = error as { code?: string; constraint?: string; message?: string } | undefined;
  if (!value || value.code !== "23505") {
    return false;
  }

  if (value.constraint === "events_external_source_external_id_unique_idx") {
    return true;
  }

  return Boolean(value.message?.includes("events_external_source_external_id_unique_idx"));
}

function csvToList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveTaxonomyIdsFromKeys(
  db: Parameters<typeof getEventById>[0],
  input: { practiceKeys: string[]; formatKeys: string[] },
): Promise<{ practiceCategoryIds: string[]; eventFormatIds: string[] }> {
  const [practiceRows, eventFormatRows] = await Promise.all([
    input.practiceKeys.length
      ? db.query<{ id: string }>(
        `
          select id
          from practices
          where key = any($1::text[])
            and is_active = true
        `,
        [input.practiceKeys],
      )
      : Promise.resolve({ rows: [] } as { rows: Array<{ id: string }> }),
    input.formatKeys.length
      ? db.query<{ id: string }>(
        `
          select id
          from event_formats
          where key = any($1::text[])
            and is_active = true
        `,
        [input.formatKeys],
      )
      : Promise.resolve({ rows: [] } as { rows: Array<{ id: string }> }),
  ]);

  return {
    practiceCategoryIds: practiceRows.rows.map((row) => row.id),
    eventFormatIds: eventFormatRows.rows.map((row) => row.id),
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidCsv(value?: string): string[] | null {
  const items = csvToList(value);
  for (const item of items) {
    if (!uuidPattern.test(item)) {
      return null;
    }
  }
  return items;
}

function resolveCoverImagePath(input: { coverImagePath?: string | null; coverImageUrl?: string | null }) {
  if (input.coverImageUrl !== undefined) {
    return input.coverImageUrl;
  }

  return input.coverImagePath;
}

function buildMeiliFilters(input: {
  from: string;
  to: string;
  practiceCategoryIds?: string[];
  practiceSubcategoryId?: string;
  eventFormatIds?: string[];
  tags: string[];
  languages: string[];
  attendanceMode?: string;
  organizerId?: string;
  countryCodes?: string[];
  cities?: string[];
  hasGeo?: boolean;
}) {
  const filters: string[] = [
    `starts_at_utc >= ${JSON.stringify(input.from)}`,
    `starts_at_utc <= ${JSON.stringify(input.to)}`,
  ];

  if (input.practiceCategoryIds?.length === 1) {
    filters.push(`practice_category_id = ${JSON.stringify(input.practiceCategoryIds[0])}`);
  } else if (input.practiceCategoryIds && input.practiceCategoryIds.length > 1) {
    filters.push(`(${input.practiceCategoryIds.map((value) => `practice_category_id = ${JSON.stringify(value)}`).join(" OR ")})`);
  }
  if (input.practiceSubcategoryId) {
    filters.push(`practice_subcategory_id = ${JSON.stringify(input.practiceSubcategoryId)}`);
  }
  if (input.eventFormatIds?.length === 1) {
    filters.push(`event_format_id = ${JSON.stringify(input.eventFormatIds[0])}`);
  } else if (input.eventFormatIds && input.eventFormatIds.length > 1) {
    filters.push(`(${input.eventFormatIds.map((value) => `event_format_id = ${JSON.stringify(value)}`).join(" OR ")})`);
  }
  if (input.tags.length) {
    for (const tag of input.tags) {
      filters.push(`tags = ${JSON.stringify(tag)}`);
    }
  }
  if (input.languages.length) {
    for (const language of input.languages) {
      filters.push(`languages = ${JSON.stringify(language)}`);
    }
  }
  if (input.attendanceMode) {
    filters.push(`attendance_mode = ${JSON.stringify(input.attendanceMode)}`);
  }
  if (input.organizerId) {
    filters.push(`organizer_ids = ${JSON.stringify(input.organizerId)}`);
  }
  if (input.countryCodes?.length) {
    const normalized = input.countryCodes
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (normalized.length === 1) {
      filters.push(`country_code = ${JSON.stringify(normalized[0])}`);
    } else if (normalized.length > 1) {
      filters.push(`(${normalized.map((value) => `country_code = ${JSON.stringify(value)}`).join(" OR ")})`);
    }
  }
  if (input.cities?.length === 1) {
    filters.push(`city = ${JSON.stringify(input.cities[0])}`);
  } else if (input.cities && input.cities.length > 1) {
    filters.push(`(${input.cities.map((value) => `city = ${JSON.stringify(value)}`).join(" OR ")})`);
  }
  if (typeof input.hasGeo === "boolean") {
    filters.push(`has_geo = ${input.hasGeo}`);
  }

  return filters;
}

function hasScheduleShapeChanges(
  previous: {
    schedule_kind: string;
    single_start_at: string | null;
    single_end_at: string | null;
    rrule: string | null;
    rrule_dtstart_local: string | null;
    duration_minutes: number | null;
    event_timezone: string;
  },
  next: {
    schedule_kind: string;
    single_start_at: string | null;
    single_end_at: string | null;
    rrule: string | null;
    rrule_dtstart_local: string | null;
    duration_minutes: number | null;
    event_timezone: string;
  },
): boolean {
  return (
    previous.schedule_kind !== next.schedule_kind ||
    previous.single_start_at !== next.single_start_at ||
    previous.single_end_at !== next.single_end_at ||
    previous.rrule !== next.rrule ||
    previous.rrule_dtstart_local !== next.rrule_dtstart_local ||
    previous.duration_minutes !== next.duration_minutes ||
    previous.event_timezone !== next.event_timezone
  );
}

const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/events/search", async (request, reply) => {
    const startedAt = Date.now();
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const now = DateTime.utc();
    const includePast = parsed.data.includePast === "true";
    const from = parsed.data.from ?? (includePast ? "1970-01-01T00:00:00.000Z" : now.toISO());
    const to = parsed.data.to ?? now.plus({ days: 365 }).toISO();
    const tags = csvToList(parsed.data.tags);
    const languages = csvToList(parsed.data.languages);
    const practiceCategoryUuids = parseUuidCsv(parsed.data.practiceCategoryId);
    const eventFormatUuids = parseUuidCsv(parsed.data.eventFormatId);
    const practiceKeys = csvToList(parsed.data.practice);
    const formatKeys = csvToList(parsed.data.format);
    const resolvedFromKeys = await resolveTaxonomyIdsFromKeys(app.db, {
      practiceKeys,
      formatKeys,
    });
    const practiceCategoryIds = [
      ...(practiceCategoryUuids ?? []),
      ...resolvedFromKeys.practiceCategoryIds,
    ];
    const eventFormatIds = [
      ...(eventFormatUuids ?? []),
      ...resolvedFromKeys.eventFormatIds,
    ];
    if (!practiceCategoryUuids || !eventFormatUuids) {
      reply.code(400);
      return {
        error: "invalid_uuid_list",
      };
    }
    const countryCodes = csvToList(parsed.data.countryCode).map((value) => value.toLowerCase());
    const cityFilters = csvToList(parsed.data.city);
    const hasGeo = parsed.data.hasGeo ? parsed.data.hasGeo === "true" : undefined;

    reply.header("Cache-Control", "public, max-age=30");
    reply.header("Vary", "Authorization");

    const normalizedSort =
      parsed.data.sort === "date_desc" ? "startsAtDesc"
        : parsed.data.sort === "date_asc" ? "startsAtAsc"
          : parsed.data.sort;

    const cacheKeyPayload = {
      q: parsed.data.q ?? "",
      from: from ?? "",
      to: to ?? "",
      practiceCategoryId: practiceCategoryIds.join(",") || null,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId ?? null,
      eventFormatId: eventFormatIds.join(",") || null,
      tags,
      languages,
      attendanceMode: parsed.data.attendanceMode ?? null,
      organizerId: parsed.data.organizerId ?? null,
      countryCode: countryCodes.join(",") || null,
      city: cityFilters.join(",") || null,
      hasGeo: hasGeo ?? null,
      sort: normalizedSort,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    };
    const cached = getSearchCache<Record<string, unknown>>("events_search", cacheKeyPayload);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "events_search" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "events_search" });

    try {
      const meiliFilters = buildMeiliFilters({
        from: from ?? now.toISO()!,
        to: to ?? now.plus({ days: 365 }).toISO()!,
        practiceCategoryIds,
        practiceSubcategoryId: parsed.data.practiceSubcategoryId,
        eventFormatIds,
        tags,
        languages,
        attendanceMode: parsed.data.attendanceMode,
        organizerId: parsed.data.organizerId,
        countryCodes,
        cities: cityFilters,
        hasGeo,
      });

      const sortExpression =
        normalizedSort === "publishedAtDesc"
          ? "published_at:desc"
          : normalizedSort === "startsAtDesc"
            ? "starts_at_utc:desc"
            : "starts_at_utc:asc";
      const index = app.meiliService.client.index(OCCURRENCES_INDEX);
      const result = await index.search<OccurrenceDoc>(parsed.data.q ?? "", {
        filter: meiliFilters,
        facets: [
          "practice_category_id",
          "practice_subcategory_id",
          "event_format_id",
          "languages",
          "attendance_mode",
          "country_code",
          "tags",
          "organizer_ids",
        ],
        sort: [sortExpression],
        limit: parsed.data.pageSize,
        offset: (parsed.data.page - 1) * parsed.data.pageSize,
      });
      const meiliHits = result.hits as OccurrenceDoc[];

        const payload = {
          hits: meiliHits.map((doc: OccurrenceDoc) => ({
          occurrenceId: doc.occurrence_id,
          startsAtUtc: doc.starts_at_utc,
          endsAtUtc: doc.ends_at_utc,
          event: {
            id: doc.event_id,
            slug: doc.event_slug,
            title: doc.title,
            coverImageUrl: doc.cover_image_path ?? null,
            attendanceMode: doc.attendance_mode,
            eventTimezone: doc.event_timezone,
            languages: doc.languages,
            tags: doc.tags,
            practiceCategoryId: doc.practice_category_id,
            practiceSubcategoryId: doc.practice_subcategory_id,
            eventFormatId: doc.event_format_id,
            isImported: Boolean(doc.is_imported),
            importSource: doc.import_source ?? null,
            externalUrl: doc.external_url ?? null,
            lastSyncedAt: doc.updated_at ?? null,
          },
          location: doc.geo
            ? {
                formatted_address: null,
                city: doc.city,
                country_code: doc.country_code,
                lat: doc.geo.lat,
                lng: doc.geo.lng,
              }
            : null,
          organizers: doc.organizer_ids.map((id: string, index2: number) => ({
            id,
            name: doc.organizer_names[index2] ?? "",
            avatarUrl: null,
            roles: [],
          })),
        })),
        totalHits: result.estimatedTotalHits ?? result.hits.length,
        facets: {
          practiceCategoryId: result.facetDistribution?.practice_category_id ?? {},
          practiceSubcategoryId: result.facetDistribution?.practice_subcategory_id ?? {},
          eventFormatId: result.facetDistribution?.event_format_id ?? {},
          languages: result.facetDistribution?.languages ?? {},
          attendanceMode: result.facetDistribution?.attendance_mode ?? {},
          countryCode: result.facetDistribution?.country_code ?? {},
          tags: result.facetDistribution?.tags ?? {},
          organizerId: result.facetDistribution?.organizer_ids ?? {},
        },
        pagination: {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          totalPages: Math.max(
            Math.ceil((result.estimatedTotalHits ?? result.hits.length) / parsed.data.pageSize),
            1,
          ),
        },
      };
      setSearchCache("events_search", cacheKeyPayload, payload);
      return payload;
    } catch {
      const fallback = await searchEventsFallback(app.db, {
        q: parsed.data.q,
        from: from ?? now.toISO()!,
        to: to ?? now.plus({ days: 365 }).toISO()!,
        practiceCategoryIds,
        practiceSubcategoryId: parsed.data.practiceSubcategoryId,
        eventFormatIds,
        tags,
        languages,
        attendanceMode: parsed.data.attendanceMode,
        organizerId: parsed.data.organizerId,
        countryCodes,
        city: cityFilters.join(","),
        hasGeo,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        sort: normalizedSort,
      });

      setSearchCache("events_search", cacheKeyPayload, fallback);
      return fallback;
    } finally {
      const durationMs = Date.now() - startedAt;
      recordSearchDuration(durationMs);
      request.log.info(
        {
          duration_ms: durationMs,
          includePast,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
        },
        "events.search.timing",
      );
    }
  });

  app.get("/events/:slug", async (request, reply) => {
    const parsed = z.object({ slug: z.string().min(1) }).safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const event = await getEventBySlug(app.db, parsed.data.slug);
    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }

    return {
      ...event,
      organizers: event.organizers.map((row) => ({
        ...row,
        id: row.organizer_id,
        slug: row.organizer_slug,
        name: row.organizer_name,
        avatarPath: row.organizer_avatar_path,
        roleId: row.role_id,
        roleKey: row.role_key,
        roleLabel: row.role_label,
      })),
      event: {
        ...event.event,
        coverImageUrl: event.event.cover_image_path ?? null,
        eventFormatId: event.event.event_format_id ?? null,
        isImported: event.event.is_imported,
        importSource: event.event.import_source,
        externalUrl: event.event.external_url,
        lastSyncedAt: event.event.updated_at,
      },
    };
  });

  app.post("/events", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const auth = request.auth!;
    const userId = await findOrCreateUserBySub(app.db, auth.sub);
    const normalizedInput = {
      ...parsed.data,
      coverImagePath: resolveCoverImagePath(parsed.data),
    };

    if (normalizedInput.externalSource && normalizedInput.externalId) {
      const existing = await getEventByExternalRef(
        app.db,
        normalizedInput.externalSource,
        normalizedInput.externalId,
      );
      if (existing) {
        reply.code(409);
        return {
          error: "external_ref_conflict",
          externalSource: normalizedInput.externalSource,
          externalId: normalizedInput.externalId,
        };
      }
    }

    let event;
    try {
      event = await createEvent(app.db, userId, normalizedInput as CreateEventInput);
    } catch (error) {
      if (isExternalRefConflict(error)) {
        reply.code(409);
        return {
          error: "external_ref_conflict",
          externalSource: normalizedInput.externalSource ?? null,
          externalId: normalizedInput.externalId ?? null,
        };
      }
      throw error;
    }

    if (normalizedInput.organizerRoles.length) {
      await setEventOrganizers(app.db, event.id, normalizedInput.organizerRoles);
    }

    if (normalizedInput.locationId !== undefined) {
      await setEventDefaultLocation(app.db, event.id, normalizedInput.locationId ?? null);
    }

    reply.code(201);
    return event;
  });

  app.patch("/events/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateEventSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const normalizedInput = {
      ...parsed.data,
      coverImagePath: resolveCoverImagePath(parsed.data),
    };

    const [previousEvent, previousLocation] = await Promise.all([
      getEventById(app.db, params.data.id),
      getEventDefaultLocation(app.db, params.data.id),
    ]);

    let event;
    try {
      event = await updateEvent(app.db, params.data.id, normalizedInput as UpdateEventInput);
    } catch (error) {
      if (isExternalRefConflict(error)) {
        reply.code(409);
        return {
          error: "external_ref_conflict",
          externalSource: normalizedInput.externalSource ?? null,
          externalId: normalizedInput.externalId ?? null,
        };
      }
      throw error;
    }

    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }

    if (normalizedInput.organizerRoles) {
      await setEventOrganizers(app.db, params.data.id, normalizedInput.organizerRoles);
    }

    if (normalizedInput.locationId !== undefined) {
      await setEventDefaultLocation(app.db, params.data.id, normalizedInput.locationId ?? null);
    }

    if (previousEvent && event.status === "published") {
      const scheduleChanged = hasScheduleShapeChanges(previousEvent, event);
      const locationChanged = normalizedInput.locationId !== undefined &&
        normalizedInput.locationId !== (previousLocation?.id ?? null);

      if (scheduleChanged || locationChanged) {
        await regenerateOccurrences(app.db, app.meiliService, params.data.id);
      }
    }

    return event;
  });

  app.post("/events/:id/publish", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    try {
      await publishEvent(app.db, app.meiliService, params.data.id);
    } catch (error) {
      if (error instanceof Error && error.message === "event_expired_for_publish") {
        reply.code(400);
        return { error: "event_expired_for_publish" };
      }
      throw error;
    }
    recordPublish();
    return { ok: true };
  });

  app.post("/events/:id/unpublish", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    await unpublishEvent(app.db, app.meiliService, params.data.id);
    return { ok: true };
  });

  app.post("/events/:id/cancel", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    await cancelEvent(app.db, app.meiliService, params.data.id);
    return { ok: true };
  });
};

export default eventRoutes;
