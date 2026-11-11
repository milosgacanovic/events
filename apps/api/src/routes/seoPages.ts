import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getCityPage, listIndexableCitiesForSitemap } from "../db/cityRepo";
import { getSeriesHub, listIndexableHubsForSitemap } from "../db/seriesHubRepo";
import { logValidation } from "../utils/validationError";

/**
 * Public SEO landing pages (SEO round 3): city pages (Proposal B) and series
 * hubs (Proposal A1). Each page and its sitemap use the same predicate.
 */
const seoPageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/cities/:country/:slug", async (request, reply) => {
    const parsed = z
      .object({ country: z.string().regex(/^[a-zA-Z]{2}$/), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) })
      .safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }
    const page = await getCityPage(app.db, parsed.data.country, parsed.data.slug);
    if (!page) {
      reply.code(404);
      return { error: "not_found" };
    }
    return page;
  });

  app.get("/seo/sitemap/cities", async (_request, reply) => {
    const items = await listIndexableCitiesForSitemap(app.db);
    reply.header("Cache-Control", "public, max-age=600");
    return { items, generatedAt: new Date().toISOString() };
  });

  app.get("/series/:slug", async (request, reply) => {
    const parsed = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) }).safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }
    const hub = await getSeriesHub(app.db, parsed.data.slug);
    if (!hub) {
      reply.code(404);
      return { error: "not_found" };
    }
    return hub;
  });

  app.get("/seo/sitemap/series", async (_request, reply) => {
    const items = await listIndexableHubsForSitemap(app.db);
    reply.header("Cache-Control", "public, max-age=600");
    return { items, generatedAt: new Date().toISOString() };
  });
};

export default seoPageRoutes;
