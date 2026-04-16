import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { geocodeSearch } from "../services/geocodeService";
import { logValidation } from "../utils/validationError";

const querySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().positive().max(10).default(8),
});

const geocodeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/geocode/search", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const results = await geocodeSearch(app.db, parsed.data.q, parsed.data.limit);
    return results;
  });
};

export default geocodeRoutes;
