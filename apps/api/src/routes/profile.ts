import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

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
};

export default profileRoutes;
