import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { createSavedSearchSchema, updateSavedSearchSchema } from "@dr-events/shared";
import {
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  pauseAllSavedSearches,
  unsubscribeSavedSearchByToken,
} from "../db/savedSearchRepo";
import { resolveUserId } from "../middleware/ownership";
import { logValidation } from "../utils/validationError";
import { config } from "../config";

function toResponse(row: {
  id: string;
  user_id: string;
  label: string | null;
  filter_snapshot: Record<string, unknown>;
  frequency: string;
  unsubscribed_at: string | null;
  last_notified_at: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    label: row.label,
    filterSnapshot: row.filter_snapshot,
    frequency: row.frequency,
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

  // Public unsubscribe endpoint linked from digest emails. Idempotent — already
  // unsubscribed tokens still render the success page so users don't get a
  // confusing "not found" if they click twice. Mirrors /api/alerts/unsubscribe.
  const querySchema = z.object({ token: z.string().uuid() });
  app.get("/saved-searches/unsubscribe", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).type("text/html").send(renderUnsubscribePage({
        title: "Invalid unsubscribe link",
        body: "This unsubscribe link is malformed. If you reached this page from an email, please contact us so we can help.",
      }));
      return;
    }

    const row = await unsubscribeSavedSearchByToken(app.db, parsed.data.token);
    reply.type("text/html").send(renderUnsubscribePage({
      title: "You're unsubscribed",
      body: row
        ? `You won't receive any more emails for this saved search.`
        : `You're already unsubscribed from this saved search. No further action needed.`,
    }));
  });
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderUnsubscribePage({ title, body }: { title: string; body: string }): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeHome = escapeHtml(config.PUBLIC_BASE_URL);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle} — DanceResource Events</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 48px 16px; }
  .card { max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; text-align: center; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  p { margin: 0 0 24px; line-height: 1.5; color: #374151; }
  a { color: #0b6e3a; text-decoration: none; font-weight: 600; }
</style>
</head><body>
<div class="card">
  <h1>${safeTitle}</h1>
  <p>${safeBody}</p>
  <p><a href="${safeHome}">Back to DanceResource Events</a></p>
</div>
</body></html>`;
}

export default savedSearchRoutes;
