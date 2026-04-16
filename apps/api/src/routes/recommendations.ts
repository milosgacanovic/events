import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { createRecommendation, countDailyRecommendations } from "../db/recommendationRepo";
import { resolveUserId } from "../middleware/ownership";
import { sendEmail } from "../services/emailService";
import { buildRecommendEmailHtml } from "../services/recommendEmailTemplate";

const DAILY_LIMIT = 5;

const recommendSchema = z.object({
  recipientEmail: z.string().email(),
  note: z.string().max(500).optional(),
});

const recommendationRoutes: FastifyPluginAsync = async (app) => {
  app.post("/events/:eventId/recommend", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const { eventId } = request.params as { eventId: string };
    const eventIdParsed = z.string().uuid().safeParse(eventId);
    if (!eventIdParsed.success) {
      reply.code(400);
      return { error: "invalid_event_id" };
    }

    const parsed = recommendSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body", details: parsed.error.issues };
    }

    const userId = await resolveUserId(app.db, auth);

    // Rate limit: 5 per day
    const dailyCount = await countDailyRecommendations(app.db, userId);
    if (dailyCount >= DAILY_LIMIT) {
      reply.code(429);
      return { error: "recommend_rate_limit", message: "Maximum 5 recommendations per day" };
    }

    // Look up event and sender info
    const eventResult = await app.db.query<{ title: string; slug: string }>(
      `SELECT title, slug FROM events WHERE id = $1`,
      [eventIdParsed.data],
    );
    if (eventResult.rows.length === 0) {
      reply.code(404);
      return { error: "event_not_found" };
    }

    const userResult = await app.db.query<{ display_name: string | null; email: string | null }>(
      `SELECT display_name, email FROM users WHERE id = $1`,
      [userId],
    );
    const senderName = userResult.rows[0]?.display_name || userResult.rows[0]?.email || "A DanceResource user";

    const rec = await createRecommendation(
      app.db,
      userId,
      parsed.data.recipientEmail,
      eventIdParsed.data,
      parsed.data.note,
    );

    // Send email
    const html = buildRecommendEmailHtml({
      senderName,
      eventTitle: eventResult.rows[0].title,
      eventSlug: eventResult.rows[0].slug,
      note: parsed.data.note ?? null,
    });
    await sendEmail(
      parsed.data.recipientEmail,
      `${senderName} recommended an event for you`,
      html,
      request.log,
    );

    return { id: rec.id, sentAt: rec.sent_at };
  });
};

export default recommendationRoutes;
