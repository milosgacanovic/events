import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  listCitySuggestions,
  listCitySuggestionsWithCoords,
  listCountryCodesInUse,
  listOrganizerCitySuggestions,
  listOrganizerTagSuggestions,
  listTagSuggestions,
} from "../db/metaRepo";
import { getUiLabels } from "../db/uiLabelRepo";
import { geocodeSearch } from "../services/geocodeService";

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

  // Public (no auth) — used by the Follow/Notify modal and anywhere else we need a
  // location picker that yields { city, countryCode, lat, lng } in one step. We
  // always try the local catalog first (instant + relevant because we already have
  // events there) and only fall back to Nominatim when the query is long enough to
  // be specific and local results are sparse.
  const suggestCitiesSchema = z.object({
    q: z.string().trim().min(1).max(80),
    limit: z.coerce.number().int().positive().max(10).default(8),
  });

  app.get("/suggest/cities", async (request, reply) => {
    const parsed = suggestCitiesSchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const { q, limit } = parsed.data;

    const cacheKey = `suggest-cities:${q.toLowerCase()}:${limit}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    type CitySuggestItem = {
      label: string;
      city: string;
      countryCode: string | null;
      lat: number;
      lng: number;
      source: "local" | "geocode";
    };

    const local = await listCitySuggestionsWithCoords(app.db, { q, limit });
    const merged: CitySuggestItem[] = local.map((row) => ({
      label:
        row.city.replace(/\b\w/g, (c) => c.toUpperCase()) +
        (row.countryCode ? `, ${row.countryCode.toUpperCase()}` : ""),
      city: row.city,
      countryCode: row.countryCode,
      lat: row.lat,
      lng: row.lng,
      source: "local",
    }));

    // Only geocode when local coverage is thin *and* the query is specific enough to
    // make the external call worth the latency. Avoids hammering Nominatim on single-letter
    // queries while the user is still typing.
    if (merged.length < limit && q.length >= 3) {
      try {
        type GeocodeResult = {
          formatted_address: string;
          lat: number;
          lng: number;
          country_code: string | null;
          city: string | null;
        };
        const geocoded = (await geocodeSearch(app.db, q, limit)) as GeocodeResult[];
        const seen = new Set(
          merged.map((item) => `${item.city}|${item.countryCode ?? ""}`),
        );
        for (const result of geocoded) {
          if (!result.city || !result.country_code) continue;
          const cityLower = result.city.toLowerCase();
          const countryLower = result.country_code.toLowerCase();
          const key = `${cityLower}|${countryLower}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({
            label: `${result.city}, ${result.country_code.toUpperCase()}`,
            city: cityLower,
            countryCode: countryLower,
            lat: result.lat,
            lng: result.lng,
            source: "geocode",
          });
          if (merged.length >= limit) break;
        }
      } catch (err) {
        // Geocoding is best-effort — surface the local results regardless.
        request.log.warn({ err }, "geocode fallback failed in /suggest/cities");
      }
    }

    const payload = { items: merged.slice(0, limit) };
    cache.set(cacheKey, { expiresAt: now + ttlMs, payload });
    return payload;
  });

  app.get("/suggest/countries", async () => {
    const cacheKey = `suggest-countries`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }
    const items = await listCountryCodesInUse(app.db);
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
