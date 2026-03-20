import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { ROLE_EDITOR } from "@dr-events/shared";

import {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplicationStatus,
} from "../db/applicationRepo";
import { resolveUserId } from "../middleware/ownership";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320),
  intent: z.string().trim().min(1).max(100),
  intentOther: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  practiceCategoryIds: z.array(z.string().uuid()).optional(),
  proofUrl: z.string().url().max(2000).optional(),
  claimHostId: z.string().uuid().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "more_info_requested"]),
  adminNotes: z.string().max(5000).optional(),
  rejectionReason: z.string().max(2000).optional(),
});

const applicationRoutes: FastifyPluginAsync = async (app) => {
  // Any authenticated user can submit an application
  app.post("/admin/applications", async (request, reply) => {
    await app.authenticate(request);

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    const application = await createApplication(app.db, {
      userId,
      ...parsed.data,
    });

    reply.code(201);
    return application;
  });

  // Admin: list applications
  app.get("/admin/applications", async (request, reply) => {
    await app.requireAdmin(request);

    const parsed = z.object({
      status: z.enum(["pending", "approved", "rejected", "more_info_requested"]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    }).safeParse(request.query);

    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    return listApplications(app.db, parsed.data);
  });

  // Admin: update application status
  app.patch("/admin/applications/:id", async (request, reply) => {
    await app.requireAdmin(request);

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: params.error.flatten() };
    }

    const parsed = updateStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const auth = request.auth!;
    const adminUserId = await resolveUserId(app.db, auth);

    const updated = await updateApplicationStatus(app.db, params.data.id, {
      ...parsed.data,
      reviewedBy: adminUserId,
    });

    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }

    // Side-effects on approval: grant Keycloak editor role + claim host
    if (parsed.data.status === "approved") {
      try {
        // Look up user's keycloak_sub
        const userRow = await app.db.query<{ keycloak_sub: string }>(
          `select keycloak_sub from users where id = $1`,
          [updated.user_id],
        );
        const sub = userRow.rows[0]?.keycloak_sub;

        if (sub && app.keycloakAdmin) {
          await app.keycloakAdmin.grantRole(sub, ROLE_EDITOR).catch((err) => {
            request.log.warn({ err, userId: updated.user_id }, "Failed to grant Keycloak editor role");
          });
        }

        // If user claimed a host, link them
        if (updated.claim_host_id) {
          await app.db.query(
            `insert into host_users (user_id, organizer_id, created_by) values ($1, $2, $3) on conflict do nothing`,
            [updated.user_id, updated.claim_host_id, adminUserId],
          );
        }
      } catch (err) {
        request.log.warn({ err }, "Application approval side-effects failed");
      }
    }

    return updated;
  });
};

export default applicationRoutes;
