import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { createSavedSearchSchema, updateSavedSearchSchema } from "@dr-events/shared";
import {
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  pauseAllSavedSearches,
} from "../db/savedSearchRepo";
import { resolveUserId } from "../middleware/ownership";
import { logValidation } from "../utils/validationError";

function toResponse(row: {
  id: string;
  user_id: string;
  label: string | null;
  filter_snapshot: Record<string, unknown>;
  frequency: string;
  notify_new: boolean;
  notify_reminders: boolean;
  notify_updates: boolean;
  unsubscribed_at: string | null;
  last_notified_at: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    label: row.label,
    filterSnapshot: row.filter_snapshot,
    frequency: row.frequency,
    notifyNew: row.notify_new,
    notifyReminders: row.notify_reminders,
    notifyUpdates: row.notify_updates,
    unsubscribedAt: row.unsubscribed_at,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
  };
}

const savedSearchRoutes: FastifyPluginAsync = async (app) => {
  // Create saved search
  app.post("/profile/saved-searches", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = createSavedSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const userId = await resolveUserId(app.db, auth);
    const row = await createSavedSearch(app.db, userId, parsed.data);
    return toResponse(row);
  });

  // Update saved search
  app.patch("/profile/saved-searches/:id", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { id } = request.params as { id: string };
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      reply.code(400);
      return { error: "invalid_id" };
    }

    const parsed = updateSavedSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const userId = await resolveUserId(app.db, auth);
    const row = await updateSavedSearch(app.db, userId, idParsed.data, parsed.data);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    return toResponse(row);
  });

  // Delete saved search
  app.delete("/profile/saved-searches/:id", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { id } = request.params as { id: string };
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      reply.code(400);
      return { error: "invalid_id" };
    }

    const userId = await resolveUserId(app.db, auth);
    const deleted = await deleteSavedSearch(app.db, userId, idParsed.data);
    return { deleted };
  });

  // Pause/resume all saved searches
  app.patch("/profile/saved-searches/pause-all", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body" };
    }

    const userId = await resolveUserId(app.db, auth);
    const count = await pauseAllSavedSearches(app.db, userId, parsed.data.paused);
    return { updated: count };
  });

  // List all saved searches
  app.get("/profile/saved-searches", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const userId = await resolveUserId(app.db, auth);
    const items = await listSavedSearches(app.db, userId);
    return { items: items.map(toResponse) };
  });
};

export default savedSearchRoutes;
