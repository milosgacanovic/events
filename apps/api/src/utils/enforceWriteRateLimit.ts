import type { FastifyReply, FastifyRequest } from "fastify";

import { checkWriteRateLimit } from "../middleware/rateLimit";
import { config } from "../config";

/**
 * Enforces a per-user rate limit on write endpoints that trigger cascading
 * work. Must be called *after* auth runs (so `request.auth.sub` is populated).
 * Falls back to IP if no auth subject is present.
 *
 * Returns `true` when the request was throttled (caller should return the
 * reply immediately), `false` when the request may proceed.
 */
export function enforceWriteRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: string,
): boolean {
  if (!config.RATE_LIMIT_ENABLED) {
    return false;
  }
  const subject = request.auth?.sub ?? request.ip ?? "unknown";
  const result = checkWriteRateLimit(subject, operation);
  if (!result.allowed) {
    reply.header("Retry-After", String(result.retryAfterSeconds));
    reply.code(429).send({ error: "rate_limit_exceeded" });
    return true;
  }
  return false;
}
