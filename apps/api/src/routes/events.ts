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
  eventHasOrganizers,
} from "../db/eventRepo";
import { createLocation, getEventDefaultLocation, setEventDefaultLocation, updateLocation } from "../db/locationRepo";
import { findOrCreateUserBySub } from "../db/userRepo";
import { resolveUserId, requireEventAccess } from "../middleware/ownership";
import { canUserEditEvent } from "../db/manageRepo";
import { archiveEvent, cancelEvent, publishEvent, regenerateOccurrences, unpublishEvent } from "../services/eventLifecycleService";
import { OCCURRENCES_INDEX, type OccurrenceDoc } from "../services/meiliService";
import { recordPublish, recordSearchDuration } from "../services/metricsStore";
import { clearSearchCache, getSearchCache, setSearchCache } from "../services/searchCache";
import {
  buildEventDateRangeMap,
  EVENT_DATE_PRESETS,
  parseEventDatePresets,
  resolveSafeTimeZone,
} from "../utils/eventDatePresets";

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
  attendanceMode: z.string().optional(),
  organizerId: z.string().uuid().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  hasGeo: z.enum(["true", "false"]).optional(),
  eventDate: z.string().optional(),
  tz: z.string().optional(),
  skipEventDateFacet: z.enum(["true", "false"]).optional(),
  showUnlisted: z.enum(["true", "false"]).optional(),
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

async function loadEventOrganizers(
  db: Parameters<typeof getEventById>[0],
  eventIds: string[],
): Promise<Map<string, Array<{ id: string; name: string; avatarUrl: string | null; roles: string[] }>>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const result = await db.query<{
    event_id: string;
    organizer_id: string;
    organizer_slug: string;
    organizer_name: string;
    role_key: string | null;
  }>(
    `
      select
        eo.event_id::text as event_id,
        o.id::text as organizer_id,
        o.slug as organizer_slug,
        o.name as organizer_name,
        r.key as role_key
      from event_organizers eo
      join organizers o on o.id = eo.organizer_id
      left join organizer_roles r on r.id = eo.role_id
      where eo.event_id = any($1::uuid[])
        and o.status = 'published'
      order by eo.event_id, eo.display_order asc nulls last, o.name asc
    `,
    [eventIds],
  );

  const byEvent = new Map<string, Map<string, { id: string; slug: string; name: string; roles: Set<string> }>>();

  for (const row of result.rows) {
    const eventBucket = byEvent.get(row.event_id) ?? new Map<string, { id: string; slug: string; name: string; roles: Set<string> }>();
    const organizer = eventBucket.get(row.organizer_id) ?? {
      id: row.organizer_id,
      slug: row.organizer_slug,
      name: row.organizer_name,
      roles: new Set<string>(),
    };
    if (row.role_key) {
      organizer.roles.add(row.role_key);
    }
    eventBucket.set(row.organizer_id, organizer);
    byEvent.set(row.event_id, eventBucket);
  }

  return new Map(
    Array.from(byEvent.entries()).map(([eventId, organizers]) => [
      eventId,
      Array.from(organizers.values()).map((organizer) => ({
        id: organizer.id,
        slug: organizer.slug,
        name: organizer.name,
        avatarUrl: null,
        roles: Array.from(organizer.roles),
      })),
    ]),
  );
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
  fromTs: number;
  toTs: number;
  practiceCategoryIds?: string[];
  practiceSubcategoryId?: string;
  eventFormatIds?: string[];
  tags: string[];
  languages: string[];
  attendanceModes?: string[];
  organizerId?: string;
  countryCodes?: string[];
  cities?: string[];
  hasGeo?: boolean;
}) {
  const filters: string[] = [
    `starts_at_ts >= ${input.fromTs}`,
    `starts_at_ts <= ${input.toTs}`,
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
  if (input.tags.length === 1) {
    filters.push(`tags = ${JSON.stringify(input.tags[0])}`);
  } else if (input.tags.length > 1) {
    filters.push(`(${input.tags.map((tag) => `tags = ${JSON.stringify(tag)}`).join(" OR ")})`);
  }
  if (input.languages.length === 1) {
    filters.push(`languages = ${JSON.stringify(input.languages[0])}`);
  } else if (input.languages.length > 1) {
    filters.push(`(${input.languages.map((language) => `languages = ${JSON.stringify(language)}`).join(" OR ")})`);
  }
  if (input.attendanceModes?.length === 1) {
    filters.push(`attendance_mode = ${JSON.stringify(input.attendanceModes[0])}`);
  } else if (input.attendanceModes && input.attendanceModes.length > 1) {
    filters.push(`(${input.attendanceModes.map((mode) => `attendance_mode = ${JSON.stringify(mode)}`).join(" OR ")})`);
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

function buildEventDateClause(input: { fromUtc: string; toUtc: string }): string {
  return `(starts_at_ts >= ${Date.parse(input.fromUtc)} AND starts_at_ts < ${Date.parse(input.toUtc)})`;
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
    const fromTs = Date.parse(from ?? now.toISO()!);
    const toTs = Date.parse(to ?? now.plus({ days: 365 }).toISO()!);
    const eventDatePresets = parseEventDatePresets(parsed.data.eventDate);
    const timezone = resolveSafeTimeZone(parsed.data.tz);
    const eventDateRangeMap = buildEventDateRangeMap(timezone, now);
    const selectedEventDateRanges = eventDatePresets.map((preset) => eventDateRangeMap[preset]);
    const tags = csvToList(parsed.data.tags).map((t) => t.toLowerCase());
    const languages = csvToList(parsed.data.languages);
    const rawAttendanceModes = csvToList(parsed.data.attendanceMode);
    const attendanceModes = rawAttendanceModes.filter(
      (value): value is "in_person" | "online" | "hybrid" =>
        value === "in_person" || value === "online" || value === "hybrid",
    );
    if (rawAttendanceModes.length > 0 && attendanceModes.length !== rawAttendanceModes.length) {
      reply.code(400);
      return { error: "invalid_attendance_mode" };
    }
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

    if (request.headers.authorization) {
      try {
        await app.authenticate(request);
      } catch {
        // Ignore auth failures — showUnlisted simply won't be respected.
      }
    }
    const isEditor = Boolean(request.auth?.isEditor);
    const showUnlisted = isEditor && parsed.data.showUnlisted === "true";

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
      attendanceMode: attendanceModes.join(",") || null,
      organizerId: parsed.data.organizerId ?? null,
      countryCode: countryCodes.join(",") || null,
      city: cityFilters.join(",") || null,
      hasGeo: hasGeo ?? null,
      eventDate: eventDatePresets,
      tz: timezone,
      skipEventDateFacet: parsed.data.skipEventDateFacet === "true",
      showUnlisted,
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
      const baseMeiliFilters = buildMeiliFilters({
        fromTs,
        toTs,
        practiceCategoryIds,
        practiceSubcategoryId: parsed.data.practiceSubcategoryId,
        eventFormatIds,
        tags,
        languages,
        attendanceModes,
        organizerId: parsed.data.organizerId,
        countryCodes,
        cities: cityFilters,
        hasGeo,
      });
      if (!showUnlisted) {
        baseMeiliFilters.push(`visibility = "public"`);
      }
      const eventDateFilterClauses = selectedEventDateRanges.map((range) => buildEventDateClause(range));
      const meiliFilters = eventDateFilterClauses.length > 0
        ? [...baseMeiliFilters, `(${eventDateFilterClauses.join(" OR ")})`]
        : baseMeiliFilters;

      const sortExpression =
        normalizedSort === "publishedAtDesc"
          ? "published_at_ts:desc"
          : normalizedSort === "startsAtDesc"
            ? "starts_at_ts:desc"
            : "starts_at_ts:asc";
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
      const organizerMap = await loadEventOrganizers(
        app.db,
        Array.from(new Set(meiliHits.map((hit) => hit.event_id).filter(Boolean))),
      );

      let eventDateFacet: Record<string, number> = {};
      if (parsed.data.skipEventDateFacet !== "true") {
        try {
          const dateFacetQueries = EVENT_DATE_PRESETS.map(async (preset) => {
            const presetRange = eventDateRangeMap[preset];
            const countResult = await index.search<OccurrenceDoc>(parsed.data.q ?? "", {
              filter: [...baseMeiliFilters, buildEventDateClause(presetRange)],
              limit: 0,
            });
            return {
              preset,
              count: countResult.estimatedTotalHits ?? countResult.hits.length,
            };
          });
          const counts = await Promise.all(dateFacetQueries);
          eventDateFacet = Object.fromEntries(counts.map((item) => [item.preset, item.count]));
        } catch (error) {
          request.log.warn({ err: error, msg: "events.search.event_date_facet_failed" });
          eventDateFacet = {};
        }
      }

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
            visibility: doc.visibility,
            isImported: Boolean(doc.is_imported),
            importSource: doc.import_source ?? null,
            externalUrl: doc.external_url ?? null,
            lastSyncedAt: doc.updated_at ?? null,
          },
          location: doc.geo || doc.city || doc.country_code
            ? {
                formatted_address: null,
                city: doc.city,
                country_code: doc.country_code,
                lat: doc.geo?.lat ?? null,
                lng: doc.geo?.lng ?? null,
              }
            : null,
          organizers: organizerMap.get(doc.event_id) ?? doc.organizer_ids.map((id: string, index2: number) => ({
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
          eventDate: eventDateFacet,
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
    } catch (error) {
      request.log.warn({ err: error, msg: "events.search.meili_failed_using_fallback" });
      const fallback = await searchEventsFallback(app.db, {
        q: parsed.data.q,
        from: from ?? now.toISO()!,
        to: to ?? now.plus({ days: 365 }).toISO()!,
        practiceCategoryIds,
        practiceSubcategoryId: parsed.data.practiceSubcategoryId,
        eventFormatIds,
        tags,
        languages,
        attendanceMode: attendanceModes.length === 1 ? attendanceModes[0] : undefined,
        organizerId: parsed.data.organizerId,
        countryCodes,
        city: cityFilters.join(","),
        hasGeo,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        sort: normalizedSort,
      });
      const payload = {
        ...fallback,
        facets: {
          ...fallback.facets,
          eventDate: {},
        },
      };
      setSearchCache("events_search", cacheKeyPayload, payload);
      return payload;
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

    if (request.headers.authorization) {
      try {
        await app.authenticate(request);
      } catch {
        // Keep public details accessible even when optional auth fails.
      }
    }

    const event = await getEventBySlug(app.db, parsed.data.slug, {
      includeNonPublic: Boolean(request.auth?.isEditor),
    });
    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Compute canEdit for authenticated users
    let canEdit = false;
    if (request.auth) {
      if (request.auth.isAdmin) {
        canEdit = true;
      } else if (request.auth.isEditor) {
        const userId = await resolveUserId(app.db, request.auth);
        canEdit = await canUserEditEvent(app.db, userId, event.event.id);
      }
    }

    return {
      ...event,
      canEdit,
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
    const userId = await findOrCreateUserBySub(app.db, auth.sub, auth.preferredUsername, auth.email, auth.roles);
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

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    const parsed = updateEventSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const forceFlag = z.object({ force: z.boolean().default(false) }).safeParse(request.body).data?.force ?? false;

    const normalizedInput = {
      ...parsed.data,
      coverImagePath: resolveCoverImagePath(parsed.data),
    };

    const [previousEvent, previousLocation] = await Promise.all([
      getEventById(app.db, params.data.id),
      getEventDefaultLocation(app.db, params.data.id),
    ]);

    // Detachment logic: if imported + not yet detached + content fields actually changed → detach
    // Skip detachment for service accounts (e.g. the importer syncing its own events)
    const isServiceAccount = auth.preferredUsername?.startsWith("service-account-") ?? false;
    if (!isServiceAccount && previousEvent && previousEvent.is_imported && !(previousEvent as { detached_from_import?: boolean }).detached_from_import) {
      const prev = previousEvent as Record<string, unknown>;
      const differs = (key: string, inputKey?: string) => {
        const newVal = (normalizedInput as Record<string, unknown>)[inputKey ?? key];
        if (newVal === undefined) return false;
        const oldVal = prev[key];
        // Treat null/undefined/"" as equivalent for comparison
        const norm = (v: unknown) => (v === null || v === undefined || v === "") ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
        return norm(newVal) !== norm(oldVal);
      };
      const contentChanged = differs("title")
        || differs("description_json", "descriptionJson")
        || differs("schedule_kind", "scheduleKind")
        || differs("rrule")
        || differs("single_start_at", "singleStartAt")
        || differs("single_end_at", "singleEndAt")
        || (normalizedInput.locationId !== undefined && String(normalizedInput.locationId ?? "") !== String(previousLocation?.id ?? ""));

      if (contentChanged) {
        const detachUserId = await resolveUserId(app.db, auth);
        await app.db.query(
          `update events set detached_from_import = true, detached_at = now(), detached_by_user_id = $2 where id = $1`,
          [params.data.id, detachUserId],
        );
      }
    }

    // Publish gate: if status is being set to published, check requirements
    if (normalizedInput.status === "published" && previousEvent && previousEvent.status !== "published") {
      const hasHosts = await eventHasOrganizers(app.db, params.data.id);
      if (!hasHosts && !forceFlag) {
        reply.code(400);
        return { error: "publish_requires_host" };
      }
    }

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

    // Location handling: if detail fields (lat/lng) are provided, update or create the location record
    const locDetails = z.object({
      locationLat: z.number().nullable().optional(),
      locationLng: z.number().nullable().optional(),
      locationCity: z.string().nullable().optional(),
      locationCountry: z.string().nullable().optional(),
      locationAddress: z.string().nullable().optional(),
      locationLabel: z.string().nullable().optional(),
    }).safeParse(request.body).data;

    let newLocationCreated = false;
    if (locDetails?.locationLat != null && locDetails?.locationLng != null) {
      const lat = locDetails.locationLat;
      const lng = locDetails.locationLng;
      const city = locDetails.locationCity ?? null;
      const country = locDetails.locationCountry ?? null;
      const address = locDetails.locationAddress ?? "";

      if (previousLocation) {
        // Update in-place
        await updateLocation(app.db, previousLocation.id, { formattedAddress: address, countryCode: country, city, lat, lng });
      } else {
        // No existing location — create one and link it
        const newLoc = await createLocation(app.db, { formattedAddress: address, countryCode: country, city, lat, lng });
        await setEventDefaultLocation(app.db, params.data.id, newLoc.id);
        newLocationCreated = true;
      }
    } else if (normalizedInput.locationId !== undefined) {
      await setEventDefaultLocation(app.db, params.data.id, normalizedInput.locationId ?? null);
    }

    const skipSearch = z.object({ skipSearch: z.coerce.boolean().default(false) })
      .safeParse(request.query).data?.skipSearch ?? false;

    if (!skipSearch && previousEvent && event.status === "published") {
      if (previousEvent.status !== "published") {
        // Transition to published — regenerate occurrences
        await regenerateOccurrences(app.db, app.meiliService, params.data.id);
      } else {
        const scheduleChanged = hasScheduleShapeChanges(previousEvent, event);
        const locationChanged = newLocationCreated || (normalizedInput.locationId !== undefined &&
          normalizedInput.locationId !== (previousLocation?.id ?? null));

        if (scheduleChanged || locationChanged) {
          await regenerateOccurrences(app.db, app.meiliService, params.data.id);
        } else {
          // Metadata change (languages, tags, title, etc.) — resync without regenerating occurrences
          await app.meiliService.upsertOccurrencesForEvent(app.db, params.data.id).catch(() => {});
          clearSearchCache();
        }
      }
    } else if (!skipSearch && previousEvent && previousEvent.status === "published"
               && (event.status === "archived" || event.status === "draft" || event.status === "cancelled")) {
      await app.meiliService.deleteOccurrencesByEventId(params.data.id).catch(() => {});
      clearSearchCache();
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

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    const skipSearch = z.object({ skipSearch: z.coerce.boolean().default(false) })
      .safeParse(request.query).data?.skipSearch ?? false;

    const body = z.object({ force: z.boolean().default(false) }).safeParse(request.body ?? {});
    const force = body.data?.force ?? false;

    const hasHosts = await eventHasOrganizers(app.db, params.data.id);
    if (!hasHosts && !force) {
      reply.code(400);
      return { error: "publish_requires_host" };
    }

    try {
      await publishEvent(app.db, app.meiliService, params.data.id, skipSearch);
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

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
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

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    await cancelEvent(app.db, app.meiliService, params.data.id);
    return { ok: true };
  });

  app.post("/events/:id/archive", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const auth = request.auth!;
    if (!auth.isAdmin) {
      const userId = await resolveUserId(app.db, auth);
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    await archiveEvent(app.db, app.meiliService, params.data.id);
    return { ok: true };
  });

  app.delete("/events/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    if (!auth.isAdmin) {
      await requireEventAccess(app.db, userId, params.data.id, false);
    }

    // Only allow deletion of draft or archived events
    const event = await getEventById(app.db, params.data.id);
    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (event.status !== "draft" && event.status !== "archived") {
      reply.code(400);
      return { error: "delete_only_draft_or_archived" };
    }

    // Hard delete with cascading cleanup
    await app.db.query(`DELETE FROM event_occurrences WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_organizers WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_locations WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_users WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM events WHERE id = $1`, [params.data.id]);

    try {
      await app.meiliService.deleteOccurrencesByEventId(params.data.id);
    } catch { /* ignore */ }
    clearSearchCache();

    return reply.code(204).send();
  });
};

export default eventRoutes;
