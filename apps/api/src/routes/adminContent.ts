import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  getAdminEventById,
  getAdminOrganizerById,
  listAdminEvents,
  listAdminOrganizers,
} from "../db/adminRepo";
import { createLocation } from "../db/locationRepo";

const eventQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "archived"]).optional(),
  externalSource: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const organizerQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const createLocationBaseSchema = z.object({
  type: z.enum(["physical", "online"]).default("physical"),
  name: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(200).optional(),
  formattedAddress: z.string().min(1).max(500).optional(),
  countryCode: z.string().min(2).max(8).optional(),
  city: z.string().min(1).max(120).optional(),
  fingerprint: z.string().min(1).max(500).optional(),
  lat: z.number().gte(-90).lte(90).nullable().optional(),
  lng: z.number().gte(-180).lte(180).nullable().optional(),
});

const createLocationSchema = createLocationBaseSchema
  .refine(
    (value) => (
      (value.lat === undefined && value.lng === undefined)
      || (value.lat === null && value.lng === null)
      || (typeof value.lat === "number" && typeof value.lng === "number")
    ),
    {
      message: "lat and lng must be provided together",
      path: ["lat"],
    },
  )
  .refine(
    (value) => {
      if (value.type !== "online") {
        return true;
      }

      return (
        (value.lat === undefined && value.lng === undefined)
        || (value.lat === null && value.lng === null)
      );
    },
    {
      message: "online locations cannot include lat/lng",
      path: ["lat"],
    },
  )
  .refine(
    (value) => {
      if (value.type === "online") {
        return Boolean(value.name || value.label);
      }

      return Boolean(value.label || value.formattedAddress || value.city || value.countryCode);
    },
    {
      message: "physical requires at least one of label/formattedAddress/city/countryCode; online requires name",
      path: ["type"],
    },
  );

const adminContentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/events", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = eventQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    if (
      (parsed.data.externalSource && !parsed.data.externalId) ||
      (!parsed.data.externalSource && parsed.data.externalId)
    ) {
      reply.code(400);
      return { error: "externalSource and externalId must be provided together" };
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

  app.post("/admin/locations", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = createLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const created = await createLocation(app.db, parsed.data as never);
    reply.code(201);
    return created;
  });
};

export default adminContentRoutes;
