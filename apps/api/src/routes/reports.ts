import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { createReport, hasReported } from "../db/reportRepo";
import { createQueueEntry } from "../db/moderationRepo";
import { resolveUserId } from "../middleware/ownership";

const reportReasonSchema = z.enum([
  "spam", "duplicate", "wrong_info", "removed", "inappropriate", "other",
]);

const createReportSchema = z.object({
  targetType: z.enum(["event", "organizer", "comment"]),
  targetId: z.string().uuid(),
  reason: reportReasonSchema,
  detail: z.string().max(1000).optional(),
});

const reportRoutes: FastifyPluginAsync = async (app) => {
  // Submit a report
  app.post("/reports", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const parsed = createReportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body", details: parsed.error.issues };
    }

    const userId = await resolveUserId(app.db, auth);
    const report = await createReport(
      app.db,
      userId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.reason,
      parsed.data.detail,
    );

    if (!report) {
      // Already reported
      reply.code(409);
      return { error: "already_reported" };
    }

    await createQueueEntry(app.db, "report", report.id);

    return {
      id: report.id,
      status: report.status,
      createdAt: report.created_at,
    };
  });

  // Check if user already reported
  app.get("/reports/status", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const query = request.query as { targetType?: string; targetId?: string };
    if (!query.targetType || !query.targetId) {
      return { reported: false };
    }

    const userId = await resolveUserId(app.db, auth);
    const reported = await hasReported(app.db, userId, query.targetType, query.targetId);
    return { reported };
  });
};

export default reportRoutes;
