import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { fetchEventCard, fetchOrganizerCard } from "../db/mapRepo";
import { buildClusters, buildOrganizerClusters } from "../services/mapClusterService";
import { getSearchCache, setSearchCache } from "../services/searchCache";
import { parseEventDatePresets } from "../utils/eventDatePresets";
import { logValidation } from "../utils/validationError";

function normalizeBbox(parts: number[]): [number, number, number, number] {
  const [rawWest, rawSouth, rawEast, rawNorth] = parts;
  const spansWorld = rawEast - rawWest >= 360;
  const west = spansWorld ? -180 : Math.max(-180, Math.min(180, rawWest));
  const east = spansWorld ? 180 : Math.max(-180, Math.min(180, rawEast));
  const south = Math.max(-90, Math.min(90, rawSouth));
  const north = Math.max(-90, Math.min(90, rawNorth));
  return [west, south, east, north];
}

const mapQuerySchema = z.object({
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  practiceCategoryId: z.string().optional(),
  practiceSubcategoryId: z.string().uuid().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  attendanceMode: z.string().optional(),
  eventFormatId: z.string().optional(),
  organizerId: z.string().uuid().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  eventDate: z.string().optional(),
  includePast: z.enum(["true", "false"]).optional(),
  tz: z.string().optional(),
  geoLat: z.coerce.number().min(-90).max(90).optional(),
  geoLng: z.coerce.number().min(-180).max(180).optional(),
  geoRadius: z.coerce.number().positive().optional(),
  bbox: z.string(),
  zoom: z.coerce.number().int().min(0).max(20),
});

const organizerMapQuerySchema = z.object({
  q: z.string().optional(),
  practiceCategoryId: z.string().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  roleKey: z.string().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  bbox: z.string(),
  zoom: z.coerce.number().int().min(0).max(20),
});

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseUuidCsv(value?: string): string[] | null {
  const items = parseCsv(value);
  for (const item of items) {
    if (!uuidPattern.test(item)) {
      return null;
    }
  }
  return items;
}

const mapRoutes: FastifyPluginAsync = async (app) => {
  app.get("/map/clusters", async (request, reply) => {
    const parsed = mapQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const rawBboxParts = parsed.data.bbox.split(",").map((value) => Number(value.trim()));
    if (rawBboxParts.length !== 4 || rawBboxParts.some((value) => Number.isNaN(value))) {
      reply.code(400);
      return { error: "bbox must be west,south,east,north" };
    }
    const bboxParts = normalizeBbox(rawBboxParts);

    const now = DateTime.utc();
    const includePast = parsed.data.includePast === "true";
    const fromUtc = parsed.data.from ?? (includePast ? "1970-01-01T00:00:00.000Z" : now.toISO()!);
    const toUtc = parsed.data.to ?? now.plus({ days: 365 }).toISO()!;
    const eventDatePresets = parseEventDatePresets(parsed.data.eventDate);

    const tags = parseCsv(parsed.data.tags);
    const languages = parseCsv(parsed.data.languages);
    const rawAttendanceModes = parseCsv(parsed.data.attendanceMode);
    const attendanceModes = rawAttendanceModes.filter(
      (value): value is "in_person" | "online" | "hybrid" =>
        value === "in_person" || value === "online" || value === "hybrid",
    );
    if (rawAttendanceModes.length > 0 && attendanceModes.length !== rawAttendanceModes.length) {
      reply.code(400);
      return { error: "invalid_attendance_mode" };
    }
    const practiceCategoryIds = parseUuidCsv(parsed.data.practiceCategoryId);
    if (!practiceCategoryIds) {
      reply.code(400);
      return { error: "invalid_uuid_list" };
    }
    const eventFormatIds = parseUuidCsv(parsed.data.eventFormatId);
    if (!eventFormatIds) {
      reply.code(400);
      return { error: "invalid_uuid_list" };
    }
    const countryCodes = parseCsv(parsed.data.countryCode).map((value) => value.toLowerCase());
    const cityFilters = parseCsv(parsed.data.city);
    const roundedBbox = bboxParts.map((value) => Number(value.toFixed(4)));
    const cacheKeyPayload = {
      q: parsed.data.q?.trim().toLowerCase() ?? null,
      fromUtc,
      toUtc,
      practiceCategoryIds,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId ?? null,
      tags,
      languages,
      attendanceModes,
      eventFormatIds,
      includePast,
      organizerId: parsed.data.organizerId ?? null,
      countryCodes,
      cities: cityFilters,
      geoLat: parsed.data.geoLat ?? null,
      geoLng: parsed.data.geoLng ?? null,
      geoRadius: parsed.data.geoRadius ?? null,
      eventDate: eventDatePresets,
      bbox: roundedBbox,
      zoom: parsed.data.zoom,
    };
    const cached = getSearchCache<Record<string, unknown>>("map_clusters", cacheKeyPayload);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "map_clusters" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "map_clusters" });

    const { collection, truncated } = await buildClusters(app.meiliService, {
      q: parsed.data.q,
      fromUtc,
      toUtc,
      eventDatePresets,
      practiceCategoryIds,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId,
      tags,
      languages,
      attendanceModes,
      eventFormatIds,
      organizerId: parsed.data.organizerId,
      countryCodes,
      cities: cityFilters,
      geoLat: parsed.data.geoLat,
      geoLng: parsed.data.geoLng,
      geoRadius: parsed.data.geoRadius,
      bbox: {
        west: bboxParts[0],
        south: bboxParts[1],
        east: bboxParts[2],
        north: bboxParts[3],
      },
      limit: 5000,
      zoom: parsed.data.zoom,
    });
    if (truncated) {
      request.log.info({ msg: "map_clusters_truncated", limit: 5000 });
    }
    const payload = {
      ...collection,
      truncated,
    };
    setSearchCache("map_clusters", cacheKeyPayload, payload);

    return payload;
  });

  app.get("/map/organizer-clusters", async (request, reply) => {
    const parsed = organizerMapQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const rawBboxParts = parsed.data.bbox.split(",").map((value) => Number(value.trim()));
    if (rawBboxParts.length !== 4 || rawBboxParts.some((value) => Number.isNaN(value))) {
      reply.code(400);
      return { error: "bbox must be west,south,east,north" };
    }
    const bboxParts = normalizeBbox(rawBboxParts);

    const practiceCategoryIds = parseUuidCsv(parsed.data.practiceCategoryId);
    if (!practiceCategoryIds) {
      reply.code(400);
      return { error: "invalid_uuid_list" };
    }

    const tags = parseCsv(parsed.data.tags);
    const languages = parseCsv(parsed.data.languages);
    const roleKeys = parseCsv(parsed.data.roleKey);
    const countryCodes = parseCsv(parsed.data.countryCode).map((item) => item.toLowerCase());
    const roundedBbox = bboxParts.map((value) => Number(value.toFixed(4)));
    const cacheKeyPayload = {
      q: parsed.data.q?.trim().toLowerCase() ?? null,
      practiceCategoryIds: practiceCategoryIds ?? [],
      tags,
      languages,
      roleKeys,
      countryCodes,
      city: parsed.data.city ?? null,
      bbox: roundedBbox,
      zoom: parsed.data.zoom,
    };
    const cached = getSearchCache<Record<string, unknown>>("organizers_map_clusters", cacheKeyPayload);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "organizers_map_clusters" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "organizers_map_clusters" });

    const { collection, truncated } = await buildOrganizerClusters(app.db, {
      q: parsed.data.q,
      practiceCategoryIds: practiceCategoryIds ?? [],
      tags,
      languages,
      roleKeys,
      countryCodes,
      city: parsed.data.city,
      bbox: {
        west: bboxParts[0],
        south: bboxParts[1],
        east: bboxParts[2],
        north: bboxParts[3],
      },
      limit: 5000,
      zoom: parsed.data.zoom,
    });
    if (truncated) {
      request.log.info({ msg: "organizer_map_clusters_truncated", limit: 5000 });
    }
    const payload = {
      ...collection,
      truncated,
    };
    setSearchCache("organizers_map_clusters", cacheKeyPayload, payload);

    return payload;
  });

  const eventCardQuerySchema = z.object({
    occurrenceId: z.string().uuid(),
  });

  app.get("/map/event-card", async (request, reply) => {
    const parsed = eventCardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const row = await fetchEventCard(app.db, parsed.data.occurrenceId);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }

    const tags = (row.tags ?? []).filter((tag) => typeof tag === "string" && tag.length > 0).slice(0, 4);

    reply.header("Cache-Control", "public, max-age=300");
    return {
      occurrenceId: row.occurrence_id,
      eventId: row.event_id,
      eventSlug: row.event_slug,
      title: row.title,
      startsAtUtc: row.starts_at_utc,
      endsAtUtc: row.ends_at_utc,
      timezone: row.timezone,
      coverImageUrl: row.cover_image_path,
      city: row.city,
      countryCode: row.country_code,
      practiceLabel: row.practice_label,
      tags,
      organizer: row.organizer_id && row.organizer_slug && row.organizer_name
        ? {
          id: row.organizer_id,
          slug: row.organizer_slug,
          name: row.organizer_name,
        }
        : null,
    };
  });

  const organizerCardQuerySchema = z.object({
    organizerId: z.string().uuid(),
  });

  app.get("/map/organizer-card", async (request, reply) => {
    const parsed = organizerCardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const row = await fetchOrganizerCard(app.db, parsed.data.organizerId);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }

    reply.header("Cache-Control", "public, max-age=300");
    return {
      organizerId: row.organizer_id,
      organizerSlug: row.organizer_slug,
      organizerName: row.organizer_name,
      avatarUrl: row.avatar_path,
      practiceLabels: row.practice_labels ?? [],
      city: row.city,
      upcomingEventCount: Number.parseInt(row.upcoming_event_count, 10) || 0,
      nextEventStartsAtUtc: row.next_event_starts_at_utc,
      nextEventTimezone: row.next_event_timezone,
    };
  });
};

export default mapRoutes;
