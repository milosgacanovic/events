import type { FastifyPluginAsync } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";

import { buildClusters } from "../services/mapClusterService";
import { getSearchCache, setSearchCache } from "../services/searchCache";

const mapQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  practiceCategoryId: z.string().uuid().optional(),
  practiceSubcategoryId: z.string().uuid().optional(),
  tags: z.string().optional(),
  languages: z.string().optional(),
  attendanceMode: z.enum(["in_person", "online", "hybrid"]).optional(),
  organizerId: z.string().uuid().optional(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  hasGeo: z.enum(["true", "false"]).optional(),
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
    const from = parsed.data.from ?? now.toISO()!;
    const to = parsed.data.to ?? now.plus({ days: 90 }).toISO()!;

    const tags = parseCsv(parsed.data.tags);
    const languages = parseCsv(parsed.data.languages);
    const cacheKeyPayload = {
      from,
      to,
      practiceCategoryId: parsed.data.practiceCategoryId ?? null,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId ?? null,
      tags,
      languages,
      attendanceMode: parsed.data.attendanceMode ?? null,
      organizerId: parsed.data.organizerId ?? null,
      countryCode: parsed.data.countryCode ?? null,
      city: parsed.data.city ?? null,
      hasGeo: parsed.data.hasGeo ?? null,
      bbox: parsed.data.bbox,
      zoom: parsed.data.zoom,
    };
    const cached = getSearchCache<Record<string, unknown>>("map_clusters", cacheKeyPayload);
    if (cached) {
      request.log.info({ msg: "search_cache_hit", scope: "map_clusters" });
      return cached;
    }
    request.log.info({ msg: "search_cache_miss", scope: "map_clusters" });

    const clusters = await buildClusters(app.db, {
      from,
      to,
      practiceCategoryId: parsed.data.practiceCategoryId,
      practiceSubcategoryId: parsed.data.practiceSubcategoryId,
      tags,
      languages,
      attendanceMode: parsed.data.attendanceMode,
      organizerId: parsed.data.organizerId,
      countryCode: parsed.data.countryCode,
      city: parsed.data.city,
      hasGeo: parsed.data.hasGeo ? parsed.data.hasGeo === "true" : undefined,
      bbox: {
        west: bboxParts[0],
        south: bboxParts[1],
        east: bboxParts[2],
        north: bboxParts[3],
      },
      zoom: parsed.data.zoom,
    });
    setSearchCache("map_clusters", cacheKeyPayload, clusters);

    return clusters;
  });
};

export default mapRoutes;
