import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  getAdminEventById,
  getAdminOrganizerById,
  listAdminEvents,
  listAdminOrganizers,
} from "../db/adminRepo";
import { getEventById, setEventOrganizersByRoleKey } from "../db/eventRepo";
import { createLocation } from "../db/locationRepo";
import {
  createOrganizer,
  getOrganizerByExternalRef,
  updateOrganizer,
} from "../db/organizerRepo";
import { geocodeSearch } from "../services/geocodeService";
import { clearSearchCache } from "../services/searchCache";

const eventQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "archived"]).optional(),
  showUnlisted: z.coerce.boolean().optional(),
  externalSource: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const organizerQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  showArchived: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const upsertOrganizerExternalSchema = z.object({
  externalSource: z.string().trim().min(1).max(255),
  externalId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().url().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  descriptionHtml: z.string().max(100000).nullable().optional(),
  descriptionJson: z.record(z.any()).optional(),
  tags: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(2).max(16)).default([]),
  profileRoleIds: z.array(z.string().uuid()).optional(),
  practiceCategoryIds: z.array(z.string().uuid()).optional(),
  locations: z.array(z.object({
    id: z.string().uuid().optional(),
    externalSource: z.string().max(255).nullable().optional(),
    externalId: z.string().max(255).nullable().optional(),
    isPrimary: z.boolean().optional(),
    label: z.string().max(255).nullable().optional(),
    formattedAddress: z.string().max(500).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    countryCode: z.string().min(2).max(8).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    provider: z.string().max(64).nullable().optional(),
    placeId: z.string().max(255).nullable().optional(),
  })).optional(),
  primaryLocationId: z.string().uuid().nullable().optional(),
  city: z.string().trim().min(1).max(120).nullable().optional(),
  countryCode: z.string().trim().min(2).max(8).nullable().optional(),
  status: z.enum(["published", "draft", "archived"]).default("published"),
});

const replaceEventOrganizersSchema = z.array(z.object({
  organizerId: z.string().uuid(),
  roleKey: z.string().trim().min(1),
  displayOrder: z.number().int().default(0),
}));

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

    return listAdminEvents(app.db, {
      ...parsed.data,
      status: parsed.data.status ?? "published",
    });
  });

  app.get("/admin/organizers", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = organizerQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    return listAdminOrganizers(app.db, {
      ...parsed.data,
      status: parsed.data.status ?? (parsed.data.showArchived ? undefined : "published"),
    });
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

  app.get("/admin/geocode/search", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = z.object({
      q: z.string().trim().min(2),
      limit: z.coerce.number().int().positive().max(10).default(8),
    }).safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    return geocodeSearch(app.db, parsed.data.q, parsed.data.limit);
  });

  app.post("/admin/organizers/upsert-external", async (request, reply) => {
    await app.requireEditor(request);

    const parsed = upsertOrganizerExternalSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const existing = await getOrganizerByExternalRef(
      app.db,
      parsed.data.externalSource,
      parsed.data.externalId,
    );
    if (existing) {
      const updated = await updateOrganizer(app.db, existing.id, {
        name: parsed.data.name,
        websiteUrl: parsed.data.websiteUrl ?? null,
        externalUrl: parsed.data.externalUrl ?? null,
        descriptionJson: parsed.data.descriptionJson ?? {},
        descriptionHtml: parsed.data.descriptionHtml ?? null,
        tags: parsed.data.tags,
        languages: parsed.data.languages,
        imageUrl: parsed.data.imageUrl ?? null,
        avatarPath: parsed.data.imageUrl ?? null,
        city: parsed.data.city ?? null,
        countryCode: parsed.data.countryCode ?? null,
        profileRoleIds: parsed.data.profileRoleIds,
        practiceCategoryIds: parsed.data.practiceCategoryIds,
        locations: parsed.data.locations,
        primaryLocationId: parsed.data.primaryLocationId,
        status: parsed.data.status,
        externalSource: parsed.data.externalSource,
        externalId: parsed.data.externalId,
      });
      clearSearchCache();
      return {
        id: updated?.id ?? existing.id,
        slug: updated?.slug ?? existing.slug,
        created: false,
      };
    }

    const created = await createOrganizer(app.db, {
      name: parsed.data.name,
      websiteUrl: parsed.data.websiteUrl ?? null,
      externalUrl: parsed.data.externalUrl ?? null,
      descriptionJson: parsed.data.descriptionJson ?? {},
      descriptionHtml: parsed.data.descriptionHtml ?? null,
      tags: parsed.data.tags,
      languages: parsed.data.languages,
      status: parsed.data.status,
      imageUrl: parsed.data.imageUrl ?? null,
      avatarPath: parsed.data.imageUrl ?? null,
      city: parsed.data.city ?? null,
      countryCode: parsed.data.countryCode ?? null,
      profileRoleIds: parsed.data.profileRoleIds,
      practiceCategoryIds: parsed.data.practiceCategoryIds,
      locations: parsed.data.locations,
      primaryLocationId: parsed.data.primaryLocationId,
      externalSource: parsed.data.externalSource,
      externalId: parsed.data.externalId,
    });
    clearSearchCache();
    reply.code(201);
    return { id: created.id, slug: created.slug, created: true };
  });

  app.post("/admin/events/:id/organizers/replace", async (request, reply) => {
    await app.requireEditor(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }
    const parsed = replaceEventOrganizersSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const event = await getEventById(app.db, params.data.id);
    if (!event) {
      reply.code(404);
      return { error: "not_found" };
    }

    const result = await setEventOrganizersByRoleKey(app.db, event.id, parsed.data);
    if (!result.ok) {
      reply.code(400);
      return {
        error: "unknown_role_key",
        missingRoleKeys: result.missingRoleKeys,
      };
    }
    return { ok: true };
  });
};

export default adminContentRoutes;
