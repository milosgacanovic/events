import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  listCitySuggestions,
  listOrganizerCitySuggestions,
  listOrganizerTagSuggestions,
  listTagSuggestions,
} from "../db/metaRepo";
import { getUiLabels } from "../db/uiLabelRepo";

const metaRoutes: FastifyPluginAsync = async (app) => {
  const cityQuerySchema = z.object({
    q: z.string().trim().max(80).optional(),
    countryCode: z.string().trim().max(8).optional(),
    exclude: z.string().trim().max(500).optional(),
    limit: z.coerce.number().int().positive().max(20).default(20),
  });
  const tagsQuerySchema = z.object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().positive().max(50).default(30),
  });
  const cache = new Map<string, { expiresAt: number; payload: unknown }>();
  const ttlMs = 30_000;

  function csvToList(value?: string): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  app.get("/meta/taxonomies", async () => {
    const [practicesResult, rolesResult, eventFormatsResult, uiLabels] = await Promise.all([
      app.db.query<{
        id: string;
        parent_id: string | null;
        level: number;
        key: string;
        label: string;
        sort_order: number;
        is_active: boolean;
      }>(
        `
          select id, parent_id, level, key, label, sort_order, is_active
          from practices
          where is_active = true
          order by level asc, sort_order asc, label asc
        `,
      ),
      app.db.query<{
        id: string;
        key: string;
        label: string;
        sort_order: number;
      }>(
        `
          select id, key, label, sort_order
          from organizer_roles
          where is_active = true
          order by sort_order asc, label asc
        `,
      ),
      app.db.query<{
        id: string;
        key: string;
        label: string;
        sort_order: number;
      }>(
        `
          select id, key, label, sort_order
          from event_formats
          where is_active = true
          order by sort_order asc, label asc
        `,
      ),
      getUiLabels(app.db),
    ]);

    const categories = practicesResult.rows
      .filter((practice) => practice.level === 1)
      .map((category) => ({
        id: category.id,
        key: category.key,
        label: category.label,
        subcategories: practicesResult.rows
          .filter((sub) => sub.parent_id === category.id)
          .map((sub) => ({
            id: sub.id,
            key: sub.key,
            label: sub.label,
          })),
      }));

    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        // Backward-compatibility for existing clients while shifting terminology.
        practiceCategory: uiLabels.categoryPlural,
      },
      practices: {
        categories,
      },
      organizerRoles: rolesResult.rows,
      eventFormats: eventFormatsResult.rows,
    };
  });

  app.get("/meta/cities", async (request, reply) => {
    const parsed = cityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const cacheKey = `cities:${parsed.data.countryCode ?? ""}:${parsed.data.q ?? ""}:${parsed.data.exclude ?? ""}:${parsed.data.limit}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const items = await listCitySuggestions(app.db, {
      ...parsed.data,
      exclude: csvToList(parsed.data.exclude),
    });
    const payload = { items };
    cache.set(cacheKey, { expiresAt: now + ttlMs, payload });
    return payload;
  });

  app.get("/meta/tags", async (request, reply) => {
    const parsed = tagsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const cacheKey = `tags:${parsed.data.q ?? ""}:${parsed.data.limit}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const items = await listTagSuggestions(app.db, parsed.data);
    const payload = { items };
    cache.set(cacheKey, { expiresAt: now + ttlMs, payload });
    return payload;
  });

  app.get("/meta/organizer-cities", async (request, reply) => {
    const parsed = cityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const cacheKey = `organizer-cities:${parsed.data.countryCode ?? ""}:${parsed.data.q ?? ""}:${parsed.data.exclude ?? ""}:${parsed.data.limit}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const items = await listOrganizerCitySuggestions(app.db, {
      ...parsed.data,
      exclude: csvToList(parsed.data.exclude),
    });
    const payload = { items };
    cache.set(cacheKey, { expiresAt: now + ttlMs, payload });
    return payload;
  });

  // Return average lat/lng for given city names (for map circle overlays)
  const cityCoordSchema = z.object({
    cities: z.string().trim().min(1).max(500),
  });

  app.get("/meta/city-coords", async (request, reply) => {
    const parsed = cityCoordSchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const cityNames = csvToList(parsed.data.cities).map((c) => c.toLowerCase()).slice(0, 10);
    if (cityNames.length === 0) return { items: [] };

    const cacheKey = `city-coords:${cityNames.join(",")}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const placeholders = cityNames.map((_, i) => `$${i + 1}`);
    const result = await app.db.query<{ city: string; lat: string; lng: string }>(
      `SELECT lower(city) as city,
              avg(ST_Y(geom::geometry))::text as lat,
              avg(ST_X(geom::geometry))::text as lng
       FROM event_occurrences
       WHERE lower(city) IN (${placeholders.join(",")})
         AND geom IS NOT NULL
       GROUP BY lower(city)`,
      cityNames,
    );
    const items = result.rows.map((r) => ({
      city: r.city,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
    }));
    const payload = { items };
    cache.set(cacheKey, { expiresAt: now + 300_000, payload });
    return payload;
  });

  app.get("/meta/organizer-tags", async (request, reply) => {
    const parsed = tagsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const cacheKey = `organizer-tags:${parsed.data.q ?? ""}:${parsed.data.limit}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const items = await listOrganizerTagSuggestions(app.db, parsed.data);
    const payload = { items };
    cache.set(cacheKey, { expiresAt: now + ttlMs, payload });
    return payload;
  });
};

export default metaRoutes;
