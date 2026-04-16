import type { FastifyRequest } from "fastify";
import type { ZodError } from "zod";

/**
 * Returns a generic validation error body and logs the full Zod detail
 * server-side. Call sites keep their existing `reply.code(400)` — this helper
 * only formats the response body so we stop leaking schema shape, field names,
 * and enum members to clients.
 *
 * Usage:
 *   if (!parsed.success) {
 *     reply.code(400);
 *     return logValidation(request, parsed.error);
 *   }
 */
export function logValidation(request: FastifyRequest, error: ZodError): { error: "validation_failed" } {
  request.log.warn({ zod: error.flatten() }, "zod validation failed");
  return { error: "validation_failed" };
}
