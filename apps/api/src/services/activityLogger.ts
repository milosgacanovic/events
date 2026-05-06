import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";

import { logActivity, type ActivityLogEntry } from "../db/activityLogRepo";

const SERVICE_ACCOUNT_PREFIX = "service-account-";
const OMITTED_SNAPSHOT: Record<string, unknown> = {
  _omitted: "Snapshot omitted for service account — see source table for current state",
};

/**
 * Record an activity log entry from a route handler.
 * Resolves actor from request.auth, extracts IP/user-agent.
 * Fire-and-forget: errors are logged but never break the request.
 */
export async function recordActivity(
  pool: Pool,
  request: FastifyRequest,
  entry: {
    action: string;
    targetType: string;
    targetId: string | null;
    targetLabel?: string | null;
    metadata?: Record<string, unknown>;
    snapshot?: Record<string, unknown> | null;
  },
): Promise<void> {
  const auth = request.auth;
  let actorId: string | null = null;
  if (auth) {
    try {
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE keycloak_sub = $1 LIMIT 1`,
        [auth.sub],
      );
      actorId = result.rows[0]?.id ?? null;
    } catch {
      // best-effort actor resolution
    }
  }

  const actorName = auth?.preferredUsername ?? auth?.email ?? null;
  // Importer-style service accounts dump full row snapshots on every upsert,
  // which dwarfs the rest of the audit log. The live source table holds the
  // current state and the feed is replayable, so we collapse the snapshot to
  // a placeholder. Deletes still get the full snapshot — once the source row
  // is gone, the snapshot is the only forensic record.
  const isServiceAccount = actorName?.startsWith(SERVICE_ACCOUNT_PREFIX) ?? false;
  const isDeleteAction = entry.action.endsWith(".delete");
  const snapshot =
    entry.snapshot && isServiceAccount && !isDeleteAction
      ? OMITTED_SNAPSHOT
      : entry.snapshot;

  const logEntry: ActivityLogEntry = {
    actorId,
    actorName,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel ?? null,
    metadata: entry.metadata,
    snapshot,
    ipAddress: request.ip ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  };

  logActivity(pool, logEntry).catch((err) => {
    request.log.error({ err }, "Failed to write activity log");
  });
}

/**
 * Strip sensitive fields from a request body before persisting to error log.
 */
export function sanitizeBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const SENSITIVE = /password|token|secret|authorization|cookie|api.?key/i;
  function clean(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(clean);
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE.test(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = clean(value);
        }
      }
      return result;
    }
    return obj;
  }
  return clean(body) as Record<string, unknown>;
}
