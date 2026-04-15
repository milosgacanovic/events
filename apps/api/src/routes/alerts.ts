import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { unsubscribeByToken } from "../db/alertRepo";
import { config } from "../config";

/**
 * Public unsubscribe endpoint linked from alert digest emails. Idempotent — already
 * unsubscribed tokens still render the success page so users don't get a confusing
 * "not found" if they click the link twice. The token is a `gen_random_uuid()` set
 * at alert creation time, unique per alert (not per email send).
 */
const alertRoutes: FastifyPluginAsync = async (app) => {
  const querySchema = z.object({ token: z.string().uuid() });

  app.get("/alerts/unsubscribe", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).type("text/html").send(renderPage({
        title: "Invalid unsubscribe link",
        body: "This unsubscribe link is malformed. If you reached this page from an email, please contact us so we can help.",
      }));
      return;
    }

    const row = await unsubscribeByToken(app.db, parsed.data.token);
    // `unsubscribeByToken` returns null both when the token doesn't exist and when
    // it was already unsubscribed (the WHERE clause requires unsubscribed_at is null).
    // We render the same friendly success page either way — there's no reason to
    // distinguish "never existed" from "already unsubscribed" to the end user.
    reply.type("text/html").send(renderPage({
      title: "You're unsubscribed",
      body: row
        ? `You won't receive any more emails for this alert.`
        : `You're already unsubscribed from this alert. No further action needed.`,
    }));
  });
};

function renderPage({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — DanceResource Events</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 48px 16px; }
  .card { max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; text-align: center; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  p { margin: 0 0 24px; line-height: 1.5; color: #374151; }
  a { color: #0f8a4a; text-decoration: none; font-weight: 600; }
</style>
</head><body>
<div class="card">
  <h1>${title}</h1>
  <p>${body}</p>
  <p><a href="${config.PUBLIC_BASE_URL}">Back to DanceResource Events</a></p>
</div>
</body></html>`;
}

export default alertRoutes;
