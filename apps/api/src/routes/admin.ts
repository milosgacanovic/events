import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createOrganizerRole,
  createPractice,
  updateOrganizerRole,
  updatePractice,
} from "../db/taxonomyRepo";
import { getUiLabels, updateUiLabels } from "../db/uiLabelRepo";

const createPracticeSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  level: z.union([z.literal(1), z.literal(2)]),
  key: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updatePracticeSchema = createPracticeSchema.partial();

const createRoleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateRoleSchema = createRoleSchema.partial();
const updateUiLabelsSchema = z.object({
  categorySingular: z.string().min(1).optional(),
  categoryPlural: z.string().min(1).optional(),
});

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/admin/practices", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = createPracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const practice = await createPractice(app.db, parsed.data);
    reply.code(201);
    return practice;
  });

  app.patch("/admin/practices/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updatePracticeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const practice = await updatePractice(app.db, params.data.id, parsed.data);
    if (!practice) {
      reply.code(404);
      return { error: "not_found" };
    }

    return practice;
  });

  app.post("/admin/organizer-roles", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = createRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const role = await createOrganizerRole(app.db, parsed.data);
    reply.code(201);
    return role;
  });

  app.patch("/admin/organizer-roles/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const role = await updateOrganizerRole(app.db, params.data.id, parsed.data);
    if (!role) {
      reply.code(404);
      return { error: "not_found" };
    }

    return role;
  });

  app.patch("/admin/ui-labels", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = updateUiLabelsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    if (
      parsed.data.categorySingular === undefined &&
      parsed.data.categoryPlural === undefined
    ) {
      reply.code(400);
      return { error: "No label fields provided" };
    }

    const uiLabels = await updateUiLabels(app.db, parsed.data);
    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        practiceCategory: uiLabels.categoryPlural,
      },
    };
  });

  app.get("/admin/ui-labels", async (request) => {
    await app.requireAdmin(request);
    const uiLabels = await getUiLabels(app.db);
    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        practiceCategory: uiLabels.categoryPlural,
      },
    };
  });
};

export default adminRoutes;
