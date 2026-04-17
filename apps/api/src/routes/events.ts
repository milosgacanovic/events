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
import { findOrCreateUserBySub, isServiceAccount } from "../db/userRepo";
import { resolveUserId, requireEventAccess } from "../middleware/ownership";
import { canUserEditEvent } from "../db/manageRepo";
import { archiveEvent, cancelEvent, publishEvent, regenerateOccurrences, syncSeriesAfterHardDelete, syncSeriesForEvent, unpublishEvent } from "../services/eventLifecycleService";
import { OCCURRENCES_INDEX, SERIES_INDEX, type OccurrenceDoc, type SeriesDoc } from "../services/meiliService";
import { config as apiConfig } from "../config";
import { deriveSeriesCadence } from "../services/seriesCadenceService";
import { recordActivity } from "../services/activityLogger";
import { logValidation } from "../utils/validationError";
import { enforceWriteRateLimit } from "../utils/enforceWriteRateLimit";
import { WRITE_RATE_LIMIT_BULK_MAX } from "../middleware/rateLimit";
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
  geoLat: z.coerce.number().min(-90).max(90).optional(),
  geoLng: z.coerce.number().min(-180).max(180).optional(),
  geoRadius: z.coerce.number().positive().optional(),
  eventDate: z.string().optional(),
  tz: z.string().optional(),
  skipEventDateFacet: z.enum(["true", "false"]).optional(),
  disjunctiveFacets: z.string().optional(),
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

type DisjunctiveGroup = "practice" | "eventFormat" | "languages" | "attendance" | "country";

const DISJUNCTIVE_GROUP_META: Record<DisjunctiveGroup, { meiliAttribute: string; responseKey: string }> = {
  practice: { meiliAttribute: "practice_category_id", responseKey: "practiceCategoryId" },
  eventFormat: { meiliAttribute: "event_format_id", responseKey: "eventFormatId" },
  languages: { meiliAttribute: "languages", responseKey: "languages" },
  attendance: { meiliAttribute: "attendance_mode", responseKey: "attendanceMode" },
  country: { meiliAttribute: "country_code", responseKey: "countryCode" },
};

function disjunctiveOverride(
  group: DisjunctiveGroup,
): Partial<Parameters<typeof buildSeriesMeiliFilters>[0]> {
  switch (group) {
    case "practice":
      return { practiceCategoryIds: [] };
    case "eventFormat":
      return { eventFormatIds: [] };
    case "languages":
      return { languages: [] };
    case "attendance":
      return { attendanceModes: [] };
    case "country":
      return { countryCodes: [] };
  }
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
  geoLat?: number;
  geoLng?: number;
  geoRadius?: number;
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
  if (input.geoLat !== undefined && input.geoLng !== undefined && input.geoRadius !== undefined) {
    filters.push(`_geoRadius(${input.geoLat}, ${input.geoLng}, ${input.geoRadius})`);
  }

  return filters;
}

function buildEventDateClause(input: { fromUtc: string; toUtc: string }): string {
  return `(starts_at_ts >= ${Date.parse(input.fromUtc)} AND starts_at_ts < ${Date.parse(input.toUtc)})`;
}

/**
 * Expand a UTC date range into a list of YYYY-MM-DD strings (inclusive).
 * Used by the series-index search path to OR-filter `upcoming_dates`.
 * Capped at 400 elements to stay within Meili filter sizing for year-long
 * horizons; wider ranges fall through to an earliest_upcoming_ts inequality.
 */
function expandUtcDateBuckets(fromUtc: string, toUtc: string): string[] {
  const start = DateTime.fromISO(fromUtc, { zone: "utc" });
  const end = DateTime.fromISO(toUtc, { zone: "utc" });
  if (!start.isValid || !end.isValid || end < start) return [];
  const buckets: string[] = [];
  let cursor = start.startOf("day");
  const stop = end.startOf("day");
  while (cursor <= stop && buckets.length < 400) {
    buckets.push(cursor.toFormat("yyyy-MM-dd"));
    cursor = cursor.plus({ days: 1 });
  }
  return buckets;
}

/**
 * Meili filter set for the series index. Same filter semantics as
 * {@link buildMeiliFilters} but with series-level attribute names:
 *   - `starts_at_ts` → `earliest_upcoming_ts` (for inequalities / sort)
 *   - Date-range presets emit an OR over `upcoming_dates` bucket strings.
 * Geo / tag / language / organizer filters reuse the same attribute shapes.
 */
function buildSeriesMeiliFilters(input: {
  fromUtc: string;
  toUtc: string;
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
  geoLat?: number;
  geoLng?: number;
  geoRadius?: number;
  selectedEventDateRanges: Array<{ fromUtc: string; toUtc: string }>;
}): string[] {
  const filters: string[] = [];

  // Primary date window: always constrain earliest_upcoming_ts to the search
  // horizon so past-only series (no upcoming dates) are excluded when the
  // caller wants future-only results.
  filters.push(`earliest_upcoming_ts >= ${Date.parse(input.fromUtc)}`);
  filters.push(`earliest_upcoming_ts <= ${Date.parse(input.toUtc)}`);

  // Date-range preset refinement (e.g. "this weekend"): OR over the UTC
  // date-bucket array. Each preset expands to its own bucket list; the
  // whole expression is ORed together, matching the old semantic.
  if (input.selectedEventDateRanges.length > 0) {
    const perPresetClauses: string[] = [];
    for (const range of input.selectedEventDateRanges) {
      const buckets = expandUtcDateBuckets(range.fromUtc, range.toUtc);
      if (buckets.length === 0) continue;
      const bucketClauses = buckets
        .map((d) => `upcoming_dates = ${JSON.stringify(d)}`)
        .join(" OR ");
      perPresetClauses.push(`(${bucketClauses})`);
    }
    if (perPresetClauses.length > 0) {
      filters.push(`(${perPresetClauses.join(" OR ")})`);
    }
  }

  if (input.practiceCategoryIds?.length === 1) {
    filters.push(`practice_category_id = ${JSON.stringify(input.practiceCategoryIds[0])}`);
  } else if (input.practiceCategoryIds && input.practiceCategoryIds.length > 1) {
    filters.push(`(${input.practiceCategoryIds.map((v) => `practice_category_id = ${JSON.stringify(v)}`).join(" OR ")})`);
  }
  if (input.practiceSubcategoryId) {
    filters.push(`practice_subcategory_id = ${JSON.stringify(input.practiceSubcategoryId)}`);
  }
  if (input.eventFormatIds?.length === 1) {
    filters.push(`event_format_id = ${JSON.stringify(input.eventFormatIds[0])}`);
  } else if (input.eventFormatIds && input.eventFormatIds.length > 1) {
    filters.push(`(${input.eventFormatIds.map((v) => `event_format_id = ${JSON.stringify(v)}`).join(" OR ")})`);
  }
  if (input.tags.length === 1) {
    filters.push(`tags = ${JSON.stringify(input.tags[0])}`);
  } else if (input.tags.length > 1) {
    filters.push(`(${input.tags.map((t) => `tags = ${JSON.stringify(t)}`).join(" OR ")})`);
  }
  if (input.languages.length === 1) {
    filters.push(`languages = ${JSON.stringify(input.languages[0])}`);
  } else if (input.languages.length > 1) {
    filters.push(`(${input.languages.map((l) => `languages = ${JSON.stringify(l)}`).join(" OR ")})`);
  }
  if (input.attendanceModes?.length === 1) {
    filters.push(`attendance_mode = ${JSON.stringify(input.attendanceModes[0])}`);
  } else if (input.attendanceModes && input.attendanceModes.length > 1) {
    filters.push(`(${input.attendanceModes.map((m) => `attendance_mode = ${JSON.stringify(m)}`).join(" OR ")})`);
  }
  if (input.organizerId) {
    filters.push(`organizer_ids = ${JSON.stringify(input.organizerId)}`);
  }
  if (input.countryCodes?.length) {
    const normalized = input.countryCodes.map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 1) {
      filters.push(`country_code = ${JSON.stringify(normalized[0])}`);
    } else if (normalized.length > 1) {
      filters.push(`(${normalized.map((v) => `country_code = ${JSON.stringify(v)}`).join(" OR ")})`);
    }
  }
  if (input.cities?.length === 1) {
    filters.push(`city = ${JSON.stringify(input.cities[0])}`);
  } else if (input.cities && input.cities.length > 1) {
    filters.push(`(${input.cities.map((v) => `city = ${JSON.stringify(v)}`).join(" OR ")})`);
  }
  if (typeof input.hasGeo === "boolean") {
    filters.push(`has_geo = ${input.hasGeo}`);
  }
  if (input.geoLat !== undefined && input.geoLng !== undefined && input.geoRadius !== undefined) {
    filters.push(`_geoRadius(${input.geoLat}, ${input.geoLng}, ${input.geoRadius})`);
  }

  return filters;
}

// Mirrors the Meili filter set as a parameterised SQL WHERE clause over
// event_occurrences + events. Returns the exact `count(distinct series_id)`
// — Meili's distinct total is an approximation and over-reports (see
// `estimatedTotalHits` vs truth). We only use this when `q === ""`; text
// queries continue to read Meili's `totalHits` since full-text ranking is
// not expressible in SQL here.
async function countDistinctSeriesIds(
  db: import("pg").Pool,
  input: {
    fromUtc: string;
    toUtc: string;
    practiceCategoryIds: string[];
    practiceSubcategoryId?: string;
    eventFormatIds: string[];
    tags: string[];
    languages: string[];
    attendanceModes: string[];
    organizerId?: string;
    countryCodes: string[];
    cities: string[];
    hasGeo?: boolean;
    geoLat?: number;
    geoLng?: number;
    geoRadius?: number;
    includeUnlisted: boolean;
    selectedEventDateRanges: Array<{ fromUtc: string; toUtc: string }>;
  },
): Promise<number> {
  const clauses: string[] = [
    "eo.starts_at_utc >= $1::timestamptz",
    "eo.starts_at_utc <= $2::timestamptz",
    "e.status = 'published'",
  ];
  const params: unknown[] = [input.fromUtc, input.toUtc];
  const next = () => `$${params.length + 1}`;

  if (!input.includeUnlisted) {
    clauses.push("e.visibility = 'public'");
  }
  if (input.practiceCategoryIds.length) {
    clauses.push(`e.practice_category_id = ANY(${next()}::uuid[])`);
    params.push(input.practiceCategoryIds);
  }
  if (input.practiceSubcategoryId) {
    clauses.push(`e.practice_subcategory_id = ${next()}::uuid`);
    params.push(input.practiceSubcategoryId);
  }
  if (input.eventFormatIds.length) {
    clauses.push(`e.event_format_id = ANY(${next()}::uuid[])`);
    params.push(input.eventFormatIds);
  }
  if (input.tags.length) {
    clauses.push(`e.tags && ${next()}::text[]`);
    params.push(input.tags);
  }
  if (input.languages.length) {
    clauses.push(`e.languages && ${next()}::text[]`);
    params.push(input.languages);
  }
  if (input.attendanceModes.length) {
    clauses.push(`e.attendance_mode = ANY(${next()}::text[])`);
    params.push(input.attendanceModes);
  }
  if (input.organizerId) {
    clauses.push(
      `exists (select 1 from event_organizers eoz where eoz.event_id = e.id and eoz.organizer_id = ${next()}::uuid)`,
    );
    params.push(input.organizerId);
  }
  if (input.countryCodes.length) {
    clauses.push(`lower(eo.country_code) = ANY(${next()}::text[])`);
    params.push(input.countryCodes);
  }
  if (input.cities.length) {
    clauses.push(`eo.city = ANY(${next()}::text[])`);
    params.push(input.cities);
  }
  if (typeof input.hasGeo === "boolean") {
    clauses.push(input.hasGeo ? "eo.geom is not null" : "eo.geom is null");
  }
  if (
    input.geoLat !== undefined &&
    input.geoLng !== undefined &&
    input.geoRadius !== undefined
  ) {
    clauses.push(
      `eo.geom is not null and ST_DWithin(eo.geom, ST_SetSRID(ST_MakePoint(${next()}::float, ${next()}::float), 4326)::geography, ${next()}::float)`,
    );
    params.push(input.geoLng, input.geoLat, input.geoRadius);
  }
  if (input.selectedEventDateRanges.length) {
    const dateClauses = input.selectedEventDateRanges.map(() => {
      const fromIdx = next();
      params.push("");
      const toIdx = next();
      params.push("");
      return `(eo.starts_at_utc >= ${fromIdx}::timestamptz AND eo.starts_at_utc < ${toIdx}::timestamptz)`;
    });
    // Fill the placeholders we just pushed.
    let cursor = params.length - input.selectedEventDateRanges.length * 2;
    for (const range of input.selectedEventDateRanges) {
      params[cursor++] = range.fromUtc;
      params[cursor++] = range.toUtc;
    }
    clauses.push(`(${dateClauses.join(" OR ")})`);
  }

  const sql = `
    select count(distinct eo.series_id)::int as total
    from event_occurrences eo
    join events e on e.id = eo.event_id
    where ${clauses.join(" AND ")}
  `;
  const result = await db.query<{ total: number }>(sql, params);
  return result.rows[0]?.total ?? 0;
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
      return logValidation(request, parsed.error);
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

    // Anonymous requests get CDN-friendly caching; authenticated ones (admins
    // with showUnlisted) must never share a cache entry with anon users.
    // s-maxage lets a front edge (Cloudflare) cache for 60s while allowing
    // stale-while-revalidate to mask origin blips. Vary on Authorization so
    // any auth scheme segments the cache correctly.
    if (request.auth) {
      reply.header("Cache-Control", "private, max-age=0, must-revalidate");
    } else {
      reply.header("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      // Cache-Tag is a Cloudflare Enterprise purge hook; harmless on lower
      // plans. Lets us fire a single tag-purge on any event-write lifecycle.
      reply.header("Cache-Tag", "events-search,series-index");
    }
    reply.header("Vary", "Authorization");

    const normalizedSort =
      parsed.data.sort === "date_desc" ? "startsAtDesc"
        : parsed.data.sort === "date_asc" ? "startsAtAsc"
          : parsed.data.sort;

    // Canonicalize array filter values so equivalent requests (e.g.
    // tags=b,a vs tags=a,b) collapse to the same cache slot.
    const sortedStrings = (arr: string[]) => [...arr].sort();
    const cacheKeyPayload = {
      q: parsed.data.q ?? "",
      from: from ?? "",
      to: to ?? "",
      practiceCategoryId: sortedStrings(practiceCategoryIds).join(",") || null,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId ?? null,
      eventFormatId: sortedStrings(eventFormatIds).join(",") || null,
      tags: sortedStrings(tags),
      languages: sortedStrings(languages),
      attendanceMode: sortedStrings(attendanceModes).join(",") || null,
      organizerId: parsed.data.organizerId ?? null,
      countryCode: sortedStrings(countryCodes).join(",") || null,
      city: sortedStrings(cityFilters).join(",") || null,
      hasGeo: hasGeo ?? null,
      geoLat: parsed.data.geoLat ?? null,
      geoLng: parsed.data.geoLng ?? null,
      geoRadius: parsed.data.geoRadius ?? null,
      eventDate: sortedStrings(eventDatePresets),
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

    // --- Series-index path (Phase 6) ----------------------------------------
    // When the flag is on, /events/search reads the `series` index directly.
    // Each Meili doc represents one series, so native totalHits + facets are
    // exact by construction — no SQL distinct math, no stopgap override.
    if (apiConfig.EVENTS_SERIES_SEARCH_ENABLED) {
      try {
        const fromUtc = from ?? now.toISO()!;
        const toUtc = to ?? now.plus({ days: 365 }).toISO()!;
        const seriesFilters = buildSeriesMeiliFilters({
          fromUtc,
          toUtc,
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
          geoLat: parsed.data.geoLat,
          geoLng: parsed.data.geoLng,
          geoRadius: parsed.data.geoRadius,
          selectedEventDateRanges,
        });
        if (!showUnlisted) {
          seriesFilters.push(`visibility = "public"`);
        }
        const sortExpression =
          normalizedSort === "startsAtDesc"
            ? "earliest_upcoming_ts:desc"
            : "earliest_upcoming_ts:asc"; // publishedAtDesc falls back to starts-asc for now.

        // Multi-search bundles main query + disjunctive-facet variants +
        // date-preset bucket counts into a single Meili request. See the
        // 10x-scale design doc: one HTTP roundtrip, one Meili queue entry.
        const disjunctiveGroups = csvToList(parsed.data.disjunctiveFacets)
          .filter((g): g is DisjunctiveGroup =>
            g === "practice" || g === "eventFormat" || g === "languages" || g === "attendance" || g === "country",
          );

        const baseFilterInput = {
          fromUtc,
          toUtc,
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
          geoLat: parsed.data.geoLat,
          geoLng: parsed.data.geoLng,
          geoRadius: parsed.data.geoRadius,
        };

        const mainFacets = [
          "practice_category_id",
          "practice_subcategory_id",
          "event_format_id",
          "languages",
          "attendance_mode",
          "country_code",
          "tags",
          "organizer_ids",
        ];
        // Tier 2: date-bucket counts come back as a facet on the main query
        // when the caller wants them. The bucket set is precomputed at index
        // time in UTC, so one facet distribution replaces the 7 preset-bucket
        // sub-searches we used to fire.
        const includeDateBucketFacet = parsed.data.skipEventDateFacet !== "true";
        if (includeDateBucketFacet) {
          mainFacets.push("event_date_buckets");
        }

        const queries: Parameters<typeof app.meiliService.multiSearchSeries>[0] = [
          {
            q: parsed.data.q ?? "",
            filter: seriesFilters,
            facets: mainFacets,
            sort: [sortExpression],
            hitsPerPage: parsed.data.pageSize,
            page: parsed.data.page,
          },
        ];

        // Disjunctive-style variant for the date-bucket facet: when an
        // eventDate preset is active, the main query's bucket distribution
        // only counts rows matching that preset (so "Today 73" becomes
        // "Today 149" after clicking it, and other chips collapse). The
        // preset chips should instead show "what you'd see if you toggled
        // this preset off" counts — same semantics as the other facet
        // groups. Fire one extra variant with the eventDate filter stripped
        // and read the bucket facet from it when present.
        let dateBucketVariantIndex: number | null = null;
        if (includeDateBucketFacet && selectedEventDateRanges.length > 0) {
          const dateBucketVariantFilters = buildSeriesMeiliFilters({
            ...baseFilterInput,
            selectedEventDateRanges: [],
          });
          if (!showUnlisted) {
            dateBucketVariantFilters.push(`visibility = "public"`);
          }
          dateBucketVariantIndex = queries.length;
          queries.push({
            q: parsed.data.q ?? "",
            filter: dateBucketVariantFilters,
            facets: ["event_date_buckets"],
            hitsPerPage: 0,
            page: 1,
          });
        }

        const disjunctiveResultIndexes = new Map<DisjunctiveGroup, number>();
        for (const group of disjunctiveGroups) {
          const variantFilters = buildSeriesMeiliFilters({
            ...baseFilterInput,
            ...disjunctiveOverride(group),
            selectedEventDateRanges,
          });
          if (!showUnlisted) {
            variantFilters.push(`visibility = "public"`);
          }
          disjunctiveResultIndexes.set(group, queries.length);
          queries.push({
            q: parsed.data.q ?? "",
            filter: variantFilters,
            facets: [DISJUNCTIVE_GROUP_META[group].meiliAttribute],
            hitsPerPage: 0,
            page: 1,
          });
        }

        const multiResult = await app.meiliService.multiSearchSeries(queries);
        const mainResult = multiResult[0];
        const result = mainResult;
        const seriesHits = mainResult.hits;
        const totalHits = mainResult.totalHits ?? seriesHits.length;

        const disjunctiveFacets: Record<string, Record<string, number>> = {};
        for (const [group, idx] of disjunctiveResultIndexes) {
          const meta = DISJUNCTIVE_GROUP_META[group];
          const distribution = multiResult[idx]?.facetDistribution?.[meta.meiliAttribute] ?? {};
          disjunctiveFacets[meta.responseKey] = distribution;
        }

        const eventDateFacet: Record<string, number> = {};
        if (includeDateBucketFacet) {
          const bucketDistribution =
            (dateBucketVariantIndex !== null
              ? multiResult[dateBucketVariantIndex]?.facetDistribution?.event_date_buckets
              : mainResult.facetDistribution?.event_date_buckets) ?? {};
          for (const preset of EVENT_DATE_PRESETS) {
            eventDateFacet[preset] = bucketDistribution[preset] ?? 0;
          }
        }

        const payload = {
          hits: seriesHits.map((doc) => ({
            // occurrenceId retained for client-compat; each "hit" is now a
            // series, so we use series_id here. The client already also
            // consumes event.seriesId.
            occurrenceId: doc.series_id,
            startsAtUtc: doc.earliest_upcoming_ts
              ? new Date(doc.earliest_upcoming_ts).toISOString()
              : new Date().toISOString(),
            endsAtUtc: doc.earliest_upcoming_end_ts
              ? new Date(doc.earliest_upcoming_end_ts).toISOString()
              : doc.earliest_upcoming_ts
                ? new Date(doc.earliest_upcoming_ts).toISOString()
                : new Date().toISOString(),
            event: {
              id: doc.canonical_event_id,
              slug: doc.slug,
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
              isImported: false,
              importSource: null as string | null,
              externalUrl: null as string | null,
              lastSyncedAt: null as string | null,
              scheduleKind: doc.schedule_kind as "single" | "recurring",
              siblingCount: doc.sibling_count ?? 1,
              seriesId: doc.series_id,
            },
            location: doc._geo || doc.city || doc.country_code
              ? {
                  formatted_address: null,
                  city: doc.city,
                  country_code: doc.country_code,
                  lat: doc._geo?.lat ?? null,
                  lng: doc._geo?.lng ?? null,
                }
              : null,
            organizers: doc.organizers ?? [],
          })),
          totalHits,
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
          disjunctiveFacets,
          pagination: {
            page: parsed.data.page,
            pageSize: parsed.data.pageSize,
            totalPages: Math.max(Math.ceil(totalHits / parsed.data.pageSize), 1),
          },
        };
        setSearchCache("events_search", cacheKeyPayload, payload);
        return payload;
      } catch (error) {
        request.log.warn({ err: error, msg: "events.search.series_index_failed_fallback" });
        // Fall through to the legacy occurrence-index path below.
      }
    }

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
        geoLat: parsed.data.geoLat,
        geoLng: parsed.data.geoLng,
        geoRadius: parsed.data.geoRadius,
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
      // hitsPerPage/page (vs limit/offset) gives us `totalHits` — a closer
      // approximation than `estimatedTotalHits` when distinctAttribute is on.
      // For text-free queries we override this with an exact SQL count below.
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
        hitsPerPage: parsed.data.pageSize,
        page: parsed.data.page,
      });
      const meiliHits = result.hits as OccurrenceDoc[];
      const organizerMap = await loadEventOrganizers(
        app.db,
        Array.from(new Set(meiliHits.map((hit) => hit.event_id).filter(Boolean))),
      );

      // Meili's `totalHits` with distinctAttribute still over-reports (known
      // limitation). When the user hasn't typed a text query we can replace
      // it with an exact SQL `count(distinct series_id)` that mirrors the
      // same filter predicates. Text queries continue to use Meili's number
      // since relevance ranking isn't expressible in SQL here.
      const meiliResultWithTotals = result as typeof result & {
        totalHits?: number;
        estimatedTotalHits?: number;
      };
      let resolvedTotalHits =
        meiliResultWithTotals.totalHits ??
        meiliResultWithTotals.estimatedTotalHits ??
        result.hits.length;
      const hasTextQuery = Boolean(parsed.data.q && parsed.data.q.trim().length > 0);
      if (!hasTextQuery) {
        try {
          resolvedTotalHits = await countDistinctSeriesIds(app.db, {
            fromUtc: from ?? now.toISO()!,
            toUtc: to ?? now.plus({ days: 365 }).toISO()!,
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
            geoLat: parsed.data.geoLat,
            geoLng: parsed.data.geoLng,
            geoRadius: parsed.data.geoRadius,
            includeUnlisted: showUnlisted,
            selectedEventDateRanges,
          });
        } catch (error) {
          request.log.warn({ err: error, msg: "events.search.sql_total_failed" });
          // Fall through with Meili's number.
        }
      }

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
            scheduleKind: doc.schedule_kind ?? "single",
            siblingCount: doc.sibling_count ?? 1,
            seriesId: doc.series_id,
          },
          location: doc._geo || doc.city || doc.country_code
            ? {
                formatted_address: null,
                city: doc.city,
                country_code: doc.country_code,
                lat: doc._geo?.lat ?? null,
                lng: doc._geo?.lng ?? null,
              }
            : null,
          organizers: organizerMap.get(doc.event_id) ?? doc.organizer_ids.map((id: string, index2: number) => ({
            id,
            name: doc.organizer_names[index2] ?? "",
            avatarUrl: null,
            roles: [],
          })),
        })),
        totalHits: resolvedTotalHits,
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
          totalPages: Math.max(Math.ceil(resolvedTotalHits / parsed.data.pageSize), 1),
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
      return logValidation(request, parsed.error);
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

    const cadence = deriveSeriesCadence(event.event, event.occurrences.upcoming);

    // Strip siblingEvents from the outgoing payload — it's an internal helper
    // for cadence derivation, not something clients need.
    const { siblingEvents: _siblingEvents, series, ...eventRest } = event;
    return {
      ...eventRest,
      canEdit,
      series: { ...series, cadence },
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
      return logValidation(request, parsed.error);
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

    recordActivity(app.db, request, {
      action: "event.create",
      targetType: "event",
      targetId: event.id,
      targetLabel: event.title,
      snapshot: event as unknown as Record<string, unknown>,
    });

    reply.code(201);
    return event;
  });

  app.patch("/events/:id", async (request, reply) => {
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

    const parsed = updateEventSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
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
    const serviceAccount = await isServiceAccount(app.db, auth.sub);
    if (!serviceAccount && previousEvent && previousEvent.is_imported && !(previousEvent as { detached_from_import?: boolean }).detached_from_import) {
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

    // Capture the pre-update series_id so series sync can also refresh the
    // series this event was moved *away from* (otherwise its aggregate row
    // keeps this event as a phantom sibling — observed in production drift
    // on 2026-04-15 where bulk series collapses left ~300 stale rows).
    const previousSeriesId =
      (previousEvent as { series_id?: string | null } | null | undefined)?.series_id ?? null;
    const currentSeriesId =
      (event as { series_id?: string | null } | null | undefined)?.series_id ?? null;
    const seriesIdChanged =
      Boolean(previousEvent) && previousSeriesId !== currentSeriesId;

    if (previousEvent && event.status === "published") {
      if (previousEvent.status !== "published") {
        // Transition to published — regenerate occurrences
        await regenerateOccurrences(
          app.db,
          app.meiliService,
          params.data.id,
          skipSearch,
          previousSeriesId,
        );
      } else {
        const scheduleChanged = hasScheduleShapeChanges(previousEvent, event);
        const locationChanged = newLocationCreated || (normalizedInput.locationId !== undefined &&
          normalizedInput.locationId !== (previousLocation?.id ?? null));

        if (scheduleChanged || locationChanged) {
          await regenerateOccurrences(
            app.db,
            app.meiliService,
            params.data.id,
            skipSearch,
            previousSeriesId,
          );
        } else {
          // Metadata change (languages, tags, title, etc.) — resync without regenerating occurrences
          if (!skipSearch) {
            await app.meiliService.upsertOccurrencesForEvent(app.db, params.data.id).catch(() => {});
          }
          await syncSeriesForEvent(
            app.db,
            app.meiliService,
            params.data.id,
            "update.metadata",
            previousSeriesId,
            skipSearch,
          );
          if (!skipSearch) clearSearchCache();
        }
      }
    } else if (previousEvent && previousEvent.status === "published"
               && (event.status === "archived" || event.status === "draft" || event.status === "cancelled")) {
      if (!skipSearch) {
        await app.meiliService.deleteOccurrencesByEventId(params.data.id).catch(() => {});
      }
      await syncSeriesForEvent(
        app.db,
        app.meiliService,
        params.data.id,
        "update.deactivate",
        previousSeriesId,
        skipSearch,
      );
      if (!skipSearch) clearSearchCache();
    } else if (seriesIdChanged && previousSeriesId) {
      // series_id edited on a non-published event — no occurrence index
      // impact, but the previous series row still needs to drop this event
      // from its aggregates.
      await syncSeriesForEvent(
        app.db,
        app.meiliService,
        params.data.id,
        "update.seriesMove",
        previousSeriesId,
        skipSearch,
      );
    }

    recordActivity(app.db, request, {
      action: "event.edit",
      targetType: "event",
      targetId: params.data.id,
      targetLabel: event.title,
      snapshot: event as unknown as Record<string, unknown>,
      metadata: previousEvent && event.visibility !== previousEvent.visibility
        ? { visibilityChange: { old: previousEvent.visibility, new: event.visibility } }
        : undefined,
    });

    return event;
  });

  app.post("/events/:id/publish", async (request, reply) => {
    await app.requireEditor(request);

    const skipSearch = z.object({ skipSearch: z.coerce.boolean().default(false) })
      .safeParse(request.query).data?.skipSearch ?? false;

    if (enforceWriteRateLimit(request, reply, "publish",
      skipSearch ? WRITE_RATE_LIMIT_BULK_MAX : 30)) return reply;

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
    recordActivity(app.db, request, {
      action: "event.publish",
      targetType: "event",
      targetId: params.data.id,
      metadata: { force },
    });
    return { ok: true };
  });

  app.post("/events/:id/unpublish", async (request, reply) => {
    await app.requireEditor(request);
    if (enforceWriteRateLimit(request, reply, "unpublish", 30)) return reply;

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

    await unpublishEvent(app.db, app.meiliService, params.data.id);
    recordActivity(app.db, request, {
      action: "event.unpublish",
      targetType: "event",
      targetId: params.data.id,
    });
    return { ok: true };
  });

  app.post("/events/:id/cancel", async (request, reply) => {
    await app.requireEditor(request);
    if (enforceWriteRateLimit(request, reply, "cancel", 30)) return reply;

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

    await cancelEvent(app.db, app.meiliService, params.data.id);
    recordActivity(app.db, request, {
      action: "event.cancel",
      targetType: "event",
      targetId: params.data.id,
    });
    return { ok: true };
  });

  app.post("/events/:id/archive", async (request, reply) => {
    await app.requireEditor(request);
    if (enforceWriteRateLimit(request, reply, "archive", 30)) return reply;

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

    await archiveEvent(app.db, app.meiliService, params.data.id);
    recordActivity(app.db, request, {
      action: "event.archive",
      targetType: "event",
      targetId: params.data.id,
    });
    return { ok: true };
  });

  app.delete("/events/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return logValidation(request, params.error);
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

    // Capture series_id before the DELETE — the parent row will be gone
    // before the series refresh runs and we still need to rebuild or drop
    // the event_series row for remaining siblings.
    const seriesId = event.series_id;

    // Snapshot before deletion for audit trail
    recordActivity(app.db, request, {
      action: "event.delete",
      targetType: "event",
      targetId: params.data.id,
      targetLabel: event.title,
      snapshot: event as unknown as Record<string, unknown>,
    });

    // Hard delete with cascading cleanup
    await app.db.query(`DELETE FROM event_occurrences WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_organizers WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_locations WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM event_users WHERE event_id = $1`, [params.data.id]);
    await app.db.query(`DELETE FROM events WHERE id = $1`, [params.data.id]);

    try {
      await app.meiliService.deleteOccurrencesByEventId(params.data.id);
    } catch { /* ignore */ }
    if (seriesId) {
      await syncSeriesAfterHardDelete(app.db, app.meiliService, seriesId);
    }
    clearSearchCache();

    return reply.code(204).send();
  });
};

export default eventRoutes;
