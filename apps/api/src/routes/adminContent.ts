import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  getAdminEventById,
  getAdminOrganizerById,
  listAdminEvents,
  listAdminOrganizers,
} from "../db/adminRepo";

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

  app.get("/admin/events/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const item = await getAdminEventById(app.db, params.data.id);
    if (!item) {
      reply.code(404);
      return { error: "not_found" };
    }

    return item;
  });

  app.get("/admin/organizers/:id", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const item = await getAdminOrganizerById(app.db, params.data.id);
    if (!item) {
      reply.code(404);
      return { error: "not_found" };
    }

    return item;
  });
};

export default adminContentRoutes;
