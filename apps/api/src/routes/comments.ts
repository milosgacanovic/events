import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createComment,
  listApprovedComments,
  deleteComment,
  listUserComments,
  countRecentComments,
} from "../db/commentRepo";
import { createQueueEntry } from "../db/moderationRepo";
import { resolveUserId } from "../middleware/ownership";

const COMMENT_RATE_LIMIT = 5; // per hour

const commentBodySchema = z.object({
  body: z.string().min(1).max(500),
});

const commentRoutes: FastifyPluginAsync = async (app) => {
  // Post a comment (auth required, rate limited)
  app.post("/events/:eventId/comments", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { eventId } = request.params as { eventId: string };
    const eventIdParsed = z.string().uuid().safeParse(eventId);
    if (!eventIdParsed.success) {
      reply.code(400);
      return { error: "invalid_event_id" };
    }

    const parsed = commentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body", details: parsed.error.issues };
    }

    // Reject comments on past single events older than 30 days
    const eventCheck = await app.db.query(
      `SELECT schedule_kind, single_end_at FROM events WHERE id = $1`,
      [eventIdParsed.data],
    );
    if (eventCheck.rows.length === 0) {
      reply.code(404);
      return { error: "event_not_found" };
    }
    const evt = eventCheck.rows[0];
    if (
      evt.schedule_kind === "single" &&
      evt.single_end_at &&
      new Date(evt.single_end_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
    ) {
      reply.code(403);
      return { error: "comments_closed", message: "Comments are closed for past events" };
    }

    const userId = await resolveUserId(app.db, auth);

    // Rate limit: 5 comments per hour per user
    const recentCount = await countRecentComments(app.db, userId);
    if (recentCount >= COMMENT_RATE_LIMIT) {
      reply.code(429);
      return { error: "comment_rate_limit", message: "Maximum 5 comments per hour" };
    }

    const comment = await createComment(app.db, userId, eventIdParsed.data, parsed.data.body);

    // Add to moderation queue
    await createQueueEntry(app.db, "comment", comment.id);

    return {
      id: comment.id,
      eventId: comment.event_id,
      body: comment.body,
      status: comment.status,
      createdAt: comment.created_at,
    };
  });

  // List approved comments (public)
  app.get("/events/:eventId/comments", async (request) => {
    const { eventId } = request.params as { eventId: string };
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit ?? "50", 10) || 50, 100);
    const offset = parseInt(query.offset ?? "0", 10) || 0;

    const { items, total } = await listApprovedComments(app.db, eventId, limit, offset);
    return {
      items: items.map((c) => ({
        id: c.id,
        body: c.body,
        displayName: c.display_name,
        createdAt: c.created_at,
      })),
      total,
    };
  });

  // Delete own comment
  app.delete("/events/:eventId/comments/:commentId", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { commentId } = request.params as { commentId: string };
    const idParsed = z.string().uuid().safeParse(commentId);
    if (!idParsed.success) {
      reply.code(400);
      return { error: "invalid_comment_id" };
    }

    const userId = await resolveUserId(app.db, auth);
    const deleted = await deleteComment(app.db, userId, idParsed.data);
    return { deleted };
  });

  // User's own comments (for profile)
  app.get("/profile/comments", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const userId = await resolveUserId(app.db, auth);
    const items = await listUserComments(app.db, userId);
    return {
      items: items.map((c) => ({
        id: c.id,
        eventId: c.event_id,
        eventTitle: c.event_title,
        eventSlug: c.event_slug,
        body: c.body,
        status: c.status,
        createdAt: c.created_at,
      })),
    };
  });
};

export default commentRoutes;
