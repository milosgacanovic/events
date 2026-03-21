import type { Pool } from "pg";
import type { AuthContext } from "@dr-events/shared";

import { findOrCreateUserBySub } from "../db/userRepo";
import { canUserEditEvent, canUserEditOrganizer } from "../db/manageRepo";

/**
 * Resolves the internal user ID from the auth context (Keycloak sub).
 * Uses upsert so the user row is always guaranteed to exist.
 */
export async function resolveUserId(
  pool: Pool,
  auth: AuthContext,
): Promise<string> {
  return findOrCreateUserBySub(pool, auth.sub, auth.preferredUsername, auth.email, auth.roles);
}

/**
 * Throws 403 if the user has no access to the event.
 * Admins always bypass.
 */
export async function requireEventAccess(
  pool: Pool,
  userId: string,
  eventId: string,
  isAdmin: boolean,
): Promise<void> {
  if (isAdmin) return;

  const hasAccess = await canUserEditEvent(pool, userId, eventId);
  if (!hasAccess) {
    const error = new Error("forbidden");
    (error as unknown as { statusCode: number }).statusCode = 403;
    throw error;
  }
}

/**
 * Throws 403 if the user has no access to the organizer.
 * Admins always bypass.
 */
export async function requireOrganizerAccess(
  pool: Pool,
  userId: string,
  organizerId: string,
  isAdmin: boolean,
): Promise<void> {
  if (isAdmin) return;

  const hasAccess = await canUserEditOrganizer(pool, userId, organizerId);
  if (!hasAccess) {
    const error = new Error("forbidden");
    (error as unknown as { statusCode: number }).statusCode = 403;
    throw error;
  }
}
