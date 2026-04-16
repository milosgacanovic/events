import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { saveEventRequestSchema } from "@dr-events/shared";
import { saveEvent, unsaveEvent, isSaved, listSavedEvents, savedEventIds } from "../db/savedEventRepo";
import { resolveUserId } from "../middleware/ownership";
import { recordActivity } from "../services/activityLogger";
import { logValidation } from "../utils/validationError";

const savedEventsRoutes: FastifyPluginAsync = async (app) => {
  // Save an event
  app.post("/profile/saved-events", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = saveEventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const userId = await resolveUserId(app.db, auth);
    const row = await saveEvent(
      app.db,
      userId,
      parsed.data.eventId,
      parsed.data.occurrenceId,
      parsed.data.scope,
    );

    recordActivity(app.db, request, {
      action: "event.save",
      targetType: "event",
      targetId: parsed.data.eventId,
    });

    return {
      id: row.id,
      eventId: row.event_id,
      occurrenceId: row.occurrence_id,
      scope: row.scope,
      createdAt: row.created_at,
    };
  });

  // Unsave an event
  app.delete("/profile/saved-events/:eventId", async (request, reply) => {
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
    const deleted = await unsaveEvent(app.db, userId, parsed.data, occurrenceId);

    if (deleted) {
      recordActivity(app.db, request, {
        action: "event.unsave",
        targetType: "event",
        targetId: parsed.data,
      });
    }

    return { deleted };
  });

  // Check save status for a single event
  app.get("/profile/saved-events/status/:eventId", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { eventId } = request.params as { eventId: string };
    const userId = await resolveUserId(app.db, auth);
    const status = await isSaved(app.db, userId, eventId);

    return status;
  });

  // List all saved events (for profile page)
  app.get("/profile/saved-events", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const userId = await resolveUserId(app.db, auth);
    const items = await listSavedEvents(app.db, userId);

    return {
      items: items.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        occurrenceId: row.occurrence_id,
        scope: row.scope,
        createdAt: row.created_at,
        eventTitle: row.event_title,
        eventSlug: row.event_slug,
        eventStatus: row.event_status,
        singleStartAt: row.single_start_at,
        nextOccurrenceStart: row.next_occurrence_start,
        coverImagePath: row.cover_image_path,
      })),
    };
  });

  // Batch check: which of the given event IDs are saved?
  app.get("/profile/saved-events/batch-status", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const query = request.query as { eventIds?: string };
    if (!query.eventIds) return { savedIds: [] };

    const ids = query.eventIds.split(",").filter(Boolean);
    const userId = await resolveUserId(app.db, auth);
    const savedSet = await savedEventIds(app.db, userId, ids);

    return { savedIds: Array.from(savedSet) };
  });
};

export default savedEventsRoutes;
