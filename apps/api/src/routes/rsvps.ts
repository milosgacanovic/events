import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { rsvpRequestSchema } from "@dr-events/shared";
import { createRsvp, deleteRsvp, getRsvpStatus, getRsvpCount, listUserRsvps } from "../db/rsvpRepo";
import { resolveUserId } from "../middleware/ownership";
import { logValidation } from "../utils/validationError";

const rsvpRoutes: FastifyPluginAsync = async (app) => {
  // Mark going
  app.post("/profile/rsvps", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = rsvpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const userId = await resolveUserId(app.db, auth);
    const row = await createRsvp(app.db, userId, parsed.data.eventId, parsed.data.occurrenceId);

    return {
      id: row.id,
      eventId: row.event_id,
      occurrenceId: row.occurrence_id,
      createdAt: row.created_at,
    };
  });

  // Un-RSVP
  app.delete("/profile/rsvps/:eventId", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { eventId } = request.params as { eventId: string };
    const parsed = z.string().uuid().safeParse(eventId);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_event_id" };
    }

    const query = request.query as { occurrenceId?: string };
    const occurrenceId = query.occurrenceId || undefined;

    const userId = await resolveUserId(app.db, auth);
    const deleted = await deleteRsvp(app.db, userId, parsed.data, occurrenceId);

    return { deleted };
  });

  // User's RSVP status for a single event (auth required)
  app.get("/events/:eventId/rsvp-status", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { eventId } = request.params as { eventId: string };
    const userId = await resolveUserId(app.db, auth);
    return getRsvpStatus(app.db, userId, eventId);
  });

  // Public RSVP count for an event
  app.get("/events/:eventId/rsvp-count", async (request) => {
    const { eventId } = request.params as { eventId: string };
    const query = request.query as { occurrenceId?: string };
    const count = await getRsvpCount(app.db, eventId, query.occurrenceId || undefined);
    return { count };
  });

  // List all RSVPs for profile page
  app.get("/profile/rsvps", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const userId = await resolveUserId(app.db, auth);
    const items = await listUserRsvps(app.db, userId);

    return {
      items: items.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        occurrenceId: row.occurrence_id,
        createdAt: row.created_at,
        eventTitle: row.event_title,
        eventSlug: row.event_slug,
        singleStartAt: row.single_start_at,
        nextOccurrenceStart: row.next_occurrence_start,
        coverImagePath: row.cover_image_path,
      })),
    };
  });
};

export default rsvpRoutes;
