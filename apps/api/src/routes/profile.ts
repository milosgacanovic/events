import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DateTime } from "luxon";

import { createUserAlert, deleteUserAlert, listUserAlerts } from "../db/alertRepo";
import { getUserProfileBySub, updateUserProfileBySub } from "../db/userRepo";

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(320).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.displayName === undefined && value.email === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one profile field is required",
      });
    }
  });

const createAlertSchema = z.object({
  organizerId: z.string().uuid(),
  radiusKm: z.number().int().min(1).max(500).default(50),
  city: z.string().trim().min(1).max(120).optional(),
  countryCode: z.string().trim().min(2).max(8).optional(),
});

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/profile", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    return {
      id: profile.id,
      keycloakSub: profile.keycloak_sub,
      displayName: profile.display_name,
      email: profile.email,
      createdAt: profile.created_at,
    };
  });

  app.patch("/profile", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const profile = await updateUserProfileBySub(app.db, auth.sub, parsed.data);
    return {
      id: profile.id,
      keycloakSub: profile.keycloak_sub,
      displayName: profile.display_name,
      email: profile.email,
      createdAt: profile.created_at,
    };
  });

  app.get("/profile/alerts", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const alerts = await listUserAlerts(app.db, profile.id);
    return {
      items: alerts.map((row) => ({
        id: row.id,
        organizerId: row.organizer_id,
        organizerName: row.organizer_name,
        organizerSlug: row.organizer_slug,
        organizerImageUrl: row.organizer_image_url,
        radiusKm: row.radius_km,
        city: row.city,
        countryCode: row.country_code,
        createdAt: row.created_at,
      })),
    };
  });

  app.post("/profile/alerts", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const parsed = createAlertSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const created = await createUserAlert(app.db, {
      userId: profile.id,
      organizerId: parsed.data.organizerId,
      radiusKm: parsed.data.radiusKm,
      city: parsed.data.city ?? null,
      countryCode: parsed.data.countryCode ?? null,
    });
    reply.code(201);
    return {
      id: created.id,
      organizerId: created.organizer_id,
      radiusKm: created.radius_km,
      city: created.city,
      countryCode: created.country_code,
      createdAt: created.created_at,
    };
  });

  app.delete("/profile/alerts/:id", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return { error: parsedParams.error.flatten() };
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const removed = await deleteUserAlert(app.db, profile.id, parsedParams.data.id);
    if (!removed) {
      reply.code(404);
      return { error: "not_found" };
    }
    return {
      ok: true,
      removedAt: DateTime.utc().toISO(),
    };
  });
};

export default profileRoutes;
