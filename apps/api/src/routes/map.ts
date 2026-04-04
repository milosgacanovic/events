import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { buildClusters, buildOrganizerClusters } from "../services/mapClusterService";
import { getSearchCache, setSearchCache } from "../services/searchCache";
import {
  buildEventDateRangeMap,
  parseEventDatePresets,
  resolveSafeTimeZone,
} from "../utils/eventDatePresets";

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
  hasGeo: z.enum(["true", "false"]).optional(),
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
      return { error: parsed.error.flatten() };
    }

    const bboxParts = parsed.data.bbox.split(",").map((value) => Number(value.trim()));
    if (bboxParts.length !== 4 || bboxParts.some((value) => Number.isNaN(value))) {
      reply.code(400);
      return { error: "bbox must be west,south,east,north" };
    }

    const now = DateTime.utc();
    const includePast = parsed.data.includePast === "true";
    const from = parsed.data.from ?? (includePast ? now.minus({ years: 1 }).toISO()! : now.toISO()!);
    const to = parsed.data.to ?? (includePast ? now.toISO()! : now.plus({ days: 90 }).toISO()!);
    const eventDatePresets = parseEventDatePresets(parsed.data.eventDate);
    const timezone = resolveSafeTimeZone(parsed.data.tz);
    const dateRangeMap = buildEventDateRangeMap(timezone, now);
    const selectedDateRanges = eventDatePresets.map((key) => dateRangeMap[key]);

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
    const roundedBbox = bboxParts.map((value) => Number(value.toFixed(4)));
    const cacheKeyPayload = {
      q: parsed.data.q?.trim().toLowerCase() ?? null,
      from,
      to,
      practiceCategoryId: parsed.data.practiceCategoryId ?? null,
      practiceCategoryIds: practiceCategoryIds ?? [],
      practiceSubcategoryId: parsed.data.practiceSubcategoryId ?? null,
      tags,
      languages,
      attendanceMode: attendanceModes.join(",") || null,
      eventFormatIds: eventFormatIds ?? [],
      includePast,
      organizerId: parsed.data.organizerId ?? null,
      countryCode: parsed.data.countryCode ?? null,
      city: parsed.data.city ?? null,
      hasGeo: parsed.data.hasGeo ?? null,
      geoLat: parsed.data.geoLat ?? null,
      geoLng: parsed.data.geoLng ?? null,
      geoRadius: parsed.data.geoRadius ?? null,
      eventDate: eventDatePresets,
      tz: timezone,
      bbox: roundedBbox,
      zoom: parsed.data.zoom,
    };
    const cached = getSearchCache<Record<string, unknown>>("map_clusters", cacheKeyPayload);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "map_clusters" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "map_clusters" });

    const { collection, truncated } = await buildClusters(app.db, {
      q: parsed.data.q,
      from,
      to,
      dateRanges: selectedDateRanges.length > 0 ? selectedDateRanges : undefined,
      practiceCategoryIds: practiceCategoryIds ?? [],
      practiceSubcategoryId: parsed.data.practiceSubcategoryId,
      tags,
      languages,
      attendanceModes,
      eventFormatIds: eventFormatIds ?? [],
      organizerId: parsed.data.organizerId,
      countryCode: parsed.data.countryCode,
      city: parsed.data.city,
      hasGeo: parsed.data.hasGeo ? parsed.data.hasGeo === "true" : undefined,
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
      return { error: parsed.error.flatten() };
    }

    const bboxParts = parsed.data.bbox.split(",").map((value) => Number(value.trim()));
    if (bboxParts.length !== 4 || bboxParts.some((value) => Number.isNaN(value))) {
      reply.code(400);
      return { error: "bbox must be west,south,east,north" };
    }

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
};

export default mapRoutes;
