import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { listPending, updateStatus } from "../db/moderationRepo";
import { resolveUserId } from "../middleware/ownership";

const moderationRoutes: FastifyPluginAsync = async (app) => {
  // List pending moderation items (admin only)
  app.get("/admin/moderation", async (request) => {
    await app.requireAdmin(request);
    const query = request.query as { type?: string };
    const items = await listPending(app.db, query.type || undefined);
    return {
      items: items.map((row) => ({
        id: row.id,
        itemType: row.item_type,
        itemId: row.item_id,
        status: row.status,
        moderatorNote: row.moderator_note,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
      })),
    };
  });

  // Review a moderation item (admin only)
  app.patch("/admin/moderation/:id", async (request, reply) => {
    await app.requireAdmin(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { id } = request.params as { id: string };
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      reply.code(400);
      return { error: "invalid_id" };
    }

    const body = request.body as { status?: string; note?: string };
    const statusParsed = z.enum(["approved", "rejected", "actioned"]).safeParse(body.status);
    if (!statusParsed.success) {
      reply.code(400);
      return { error: "invalid_status" };
    }

    const moderatorId = await resolveUserId(app.db, auth);
    const updated = await updateStatus(app.db, idParsed.data, statusParsed.data, moderatorId, body.note);
    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }

    return {
      id: updated.id,
      itemType: updated.item_type,
      itemId: updated.item_id,
      status: updated.status,
      moderatorNote: updated.moderator_note,
      reviewedAt: updated.reviewed_at,
    };
  });
};

export default moderationRoutes;
