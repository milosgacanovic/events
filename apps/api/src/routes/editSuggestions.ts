import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { createEditSuggestion } from "../db/editSuggestionRepo";
import { createQueueEntry } from "../db/moderationRepo";
import { resolveUserId } from "../middleware/ownership";

const suggestionCategorySchema = z.enum([
  "name", "datetime", "location", "description", "host", "practice", "other",
]);

const createSuggestionSchema = z.object({
  targetType: z.enum(["event", "organizer"]),
  targetId: z.string().uuid(),
  category: suggestionCategorySchema,
  body: z.string().min(1).max(500),
});

const editSuggestionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/suggestions", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = createSuggestionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body", details: parsed.error.issues };
    }

    const userId = await resolveUserId(app.db, auth);
    const suggestion = await createEditSuggestion(
      app.db,
      userId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.category,
      parsed.data.body,
    );

    await createQueueEntry(app.db, "suggestion", suggestion.id);

    return {
      id: suggestion.id,
      status: suggestion.status,
      createdAt: suggestion.created_at,
    };
  });
};

export default editSuggestionRoutes;
