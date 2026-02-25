import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { listAdminEvents, listAdminOrganizers } from "../db/adminRepo";

const eventQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const organizerQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const adminContentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/events", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = eventQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    return listAdminEvents(app.db, parsed.data);
  });

  app.get("/admin/organizers", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = organizerQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    return listAdminOrganizers(app.db, parsed.data);
  });
};

export default adminContentRoutes;
