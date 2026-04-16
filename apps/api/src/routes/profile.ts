import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DateTime } from "luxon";

import {
  createUserAlert,
  deleteUserAlert,
  getAlertForOrganizer,
  listUserAlerts,
  updateUserAlert,
} from "../db/alertRepo";
import { getUserProfileBySub, updateUserProfileBySub } from "../db/userRepo";
import { recordActivity } from "../services/activityLogger";
import { logValidation } from "../utils/validationError";

const nullableString = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

const latSchema = z.union([z.number().min(-90).max(90), z.null()]).optional();
const lngSchema = z.union([z.number().min(-180).max(180), z.null()]).optional();
const countryCodeSchema = z
  .union([z.string().trim().regex(/^[a-zA-Z]{2}$/, { message: "country_code_must_be_iso2" }), z.null()])
  .optional();

// Email is intentionally NOT writable here: Keycloak is the authoritative
// source (it handles verification, reset flows, uniqueness) and
// `findOrCreateUserBySub` re-syncs it from the JWT claim on every
// authenticated request. Allowing an unverified write here would let a user
// overwrite their cached `users.email` row with any string, which the alerts
// digest system then trusts for outbound email. Users who want to change
// their email should do it in the Keycloak account console.
const updateProfileSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    homeCountryCode: countryCodeSchema,
    homeCity: nullableString(120),
    homeLat: latSchema,
    homeLng: lngSchema,
    homeLocationLabel: nullableString(240),
    defaultRadiusKm: z.union([z.number().int().min(1).max(5000), z.null()]).optional(),
  })
  .superRefine((value, ctx) => {
    const hasAny =
      value.displayName !== undefined ||
      value.homeCountryCode !== undefined ||
      value.homeCity !== undefined ||
      value.homeLat !== undefined ||
      value.homeLng !== undefined ||
      value.homeLocationLabel !== undefined ||
      value.defaultRadiusKm !== undefined;
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one profile field is required",
      });
    }
  });

const alertPayloadSchema = z.object({
  radiusKm: z.number().int().min(1).max(5000).default(50),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  locationLabel: z.string().trim().max(240).nullable().optional(),
  // Legacy fields kept optional for backward compatibility; new clients send lat/lng/label.
  city: z.string().trim().min(1).max(120).nullable().optional(),
  countryCode: z.string().trim().min(2).max(8).nullable().optional(),
});

const createAlertSchema = alertPayloadSchema.extend({
  organizerId: z.string().uuid(),
});

function profileResponse(profile: Awaited<ReturnType<typeof getUserProfileBySub>>) {
  return {
    id: profile.id,
    keycloakSub: profile.keycloak_sub,
    displayName: profile.display_name,
    email: profile.email,
    homeCountryCode: profile.home_country_code,
    homeCity: profile.home_city,
    homeLat: profile.home_lat != null ? Number(profile.home_lat) : null,
    homeLng: profile.home_lng != null ? Number(profile.home_lng) : null,
    homeLocationLabel: profile.home_location_label,
    defaultRadiusKm: profile.default_radius_km,
    createdAt: profile.created_at,
  };
}

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/profile", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    return profileResponse(profile);
  });

  app.patch("/profile", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const profile = await updateUserProfileBySub(app.db, auth.sub, parsed.data);
    return profileResponse(profile);
  });

  app.get("/profile/counts", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const result = await app.db.query<{
      save_count: string;
      rsvp_count: string;
      follow_count: string;
      comment_count: string;
    }>(
      `select
        (select count(*)::int from saved_events where user_id = u.id) as save_count,
        (select count(*)::int from event_rsvps where user_id = u.id) as rsvp_count,
        (select count(*)::int from user_alerts where user_id = u.id and unsubscribed_at is null) as follow_count,
        (select count(*)::int from comments where user_id = u.id) as comment_count
       from users u where u.keycloak_sub = $1`,
      [auth.sub],
    );
    const row = result.rows[0];
    return {
      saves: Number(row?.save_count ?? 0),
      rsvps: Number(row?.rsvp_count ?? 0),
      follows: Number(row?.follow_count ?? 0),
      comments: Number(row?.comment_count ?? 0),
    };
  });

  app.get("/profile/alerts", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const alerts = await listUserAlerts(app.db, profile.id);
    return {
      items: alerts.map((row) => ({
        id: row.id,
        organizerId: row.organizer_id,
        organizerName: row.organizer_name,
        organizerSlug: row.organizer_slug,
        organizerImageUrl: row.organizer_image_url,
        radiusKm: row.radius_km,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        locationLabel: row.location_label,
        city: row.city,
        countryCode: row.country_code,
        unsubscribedAt: row.unsubscribed_at,
        createdAt: row.created_at,
      })),
    };
  });

  app.post("/profile/alerts", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }

    const parsed = createAlertSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const created = await createUserAlert(app.db, {
      userId: profile.id,
      organizerId: parsed.data.organizerId,
      radiusKm: parsed.data.radiusKm,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      locationLabel: parsed.data.locationLabel ?? null,
      city: parsed.data.city ?? null,
      countryCode: parsed.data.countryCode ?? null,
    });

    recordActivity(app.db, request, {
      action: "host.follow",
      targetType: "organizer",
      targetId: parsed.data.organizerId,
    });

    reply.code(201);
    return {
      id: created.id,
      organizerId: created.organizer_id,
      radiusKm: created.radius_km,
      lat: created.lat != null ? Number(created.lat) : null,
      lng: created.lng != null ? Number(created.lng) : null,
      locationLabel: created.location_label,
      city: created.city,
      countryCode: created.country_code,
      createdAt: created.created_at,
    };
  });

  app.patch("/profile/alerts/:id", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return logValidation(request, parsedParams.error);
    }
    const parsed = alertPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const updated = await updateUserAlert(app.db, profile.id, parsedParams.data.id, {
      radiusKm: parsed.data.radiusKm,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      locationLabel: parsed.data.locationLabel ?? null,
      city: parsed.data.city ?? null,
      countryCode: parsed.data.countryCode ?? null,
    });
    if (!updated) {
      reply.code(404);
      return { error: "not_found" };
    }
    return {
      id: updated.id,
      organizerId: updated.organizer_id,
      radiusKm: updated.radius_km,
      lat: updated.lat != null ? Number(updated.lat) : null,
      lng: updated.lng != null ? Number(updated.lng) : null,
      locationLabel: updated.location_label,
      city: updated.city,
      countryCode: updated.country_code,
      createdAt: updated.created_at,
    };
  });

  app.delete("/profile/alerts/:id", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return logValidation(request, parsedParams.error);
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const removed = await deleteUserAlert(app.db, profile.id, parsedParams.data.id);
    if (!removed) {
      reply.code(404);
      return { error: "not_found" };
    }

    recordActivity(app.db, request, {
      action: "host.unfollow",
      targetType: "organizer",
      targetId: removed.organizer_id,
    });

    return {
      ok: true,
      removedAt: DateTime.utc().toISO(),
    };
  });

  app.get("/profile/alerts/for-organizer/:organizerId", async (request, reply) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) {
      throw app.httpErrors.unauthorized("invalid_subject");
    }
    const parsed = z.object({ organizerId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return logValidation(request, parsed.error);
    }
    const profile = await getUserProfileBySub(app.db, auth.sub);
    const alert = await getAlertForOrganizer(app.db, profile.id, parsed.data.organizerId);
    if (!alert) {
      return { alert: null };
    }
    return {
      alert: {
        id: alert.id,
        organizerId: alert.organizer_id,
        radiusKm: alert.radius_km,
        lat: alert.lat != null ? Number(alert.lat) : null,
        lng: alert.lng != null ? Number(alert.lng) : null,
        locationLabel: alert.location_label,
        city: alert.city,
        countryCode: alert.country_code,
        unsubscribedAt: alert.unsubscribed_at,
        createdAt: alert.created_at,
      },
    };
  });

  // ── Notification Preferences ─────────────────────────────────────────
  app.get("/profile/notification-preferences", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const result = await app.db.query<{
      email_enabled: boolean;
      digest_frequency: string;
      pause_until: string | null;
      notify_followed_hosts: boolean;
      notify_saved_reminders: boolean;
      notify_rsvp_reminders: boolean;
      notify_event_updates: boolean;
      notify_search_alerts: boolean;
    }>(
      `select email_enabled, digest_frequency, pause_until,
              notify_followed_hosts, notify_saved_reminders,
              notify_rsvp_reminders, notify_event_updates, notify_search_alerts
       from notification_preferences where user_id = $1`,
      [profile.id],
    );
    const row = result.rows[0];
    return {
      emailEnabled: row?.email_enabled ?? true,
      digestFrequency: row?.digest_frequency ?? "weekly",
      pauseUntil: row?.pause_until ?? null,
      notifyFollowedHosts: row?.notify_followed_hosts ?? true,
      notifySavedReminders: row?.notify_saved_reminders ?? true,
      notifyRsvpReminders: row?.notify_rsvp_reminders ?? true,
      notifyEventUpdates: row?.notify_event_updates ?? true,
      notifySearchAlerts: row?.notify_search_alerts ?? true,
    };
  });

  app.patch("/profile/notification-preferences", async (request) => {
    await app.authenticate(request);
    const auth = request.auth;
    if (!auth?.sub) throw app.httpErrors.unauthorized("invalid_subject");

    const schema = z.object({
      emailEnabled: z.boolean().optional(),
      digestFrequency: z.enum(["daily", "weekly"]).optional(),
      pauseUntil: z.string().nullable().optional(),
      notifyFollowedHosts: z.boolean().optional(),
      notifySavedReminders: z.boolean().optional(),
      notifyRsvpReminders: z.boolean().optional(),
      notifyEventUpdates: z.boolean().optional(),
      notifySearchAlerts: z.boolean().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest("invalid_body");
    }

    const profile = await getUserProfileBySub(app.db, auth.sub);
    const d = parsed.data;

    const result = await app.db.query<{
      email_enabled: boolean;
      digest_frequency: string;
      pause_until: string | null;
      notify_followed_hosts: boolean;
      notify_saved_reminders: boolean;
      notify_rsvp_reminders: boolean;
      notify_event_updates: boolean;
      notify_search_alerts: boolean;
    }>(
      `insert into notification_preferences (
        user_id, email_enabled, digest_frequency, pause_until,
        notify_followed_hosts, notify_saved_reminders, notify_rsvp_reminders,
        notify_event_updates, notify_search_alerts, updated_at
      ) values ($1,
        coalesce($2, true), coalesce($3, 'weekly'), $4,
        coalesce($5, true), coalesce($6, true), coalesce($7, true),
        coalesce($8, true), coalesce($9, true), now()
      )
      on conflict (user_id) do update set
        email_enabled = coalesce($2, notification_preferences.email_enabled),
        digest_frequency = coalesce($3, notification_preferences.digest_frequency),
        pause_until = case when $4::text = '' then null else coalesce($4::date, notification_preferences.pause_until) end,
        notify_followed_hosts = coalesce($5, notification_preferences.notify_followed_hosts),
        notify_saved_reminders = coalesce($6, notification_preferences.notify_saved_reminders),
        notify_rsvp_reminders = coalesce($7, notification_preferences.notify_rsvp_reminders),
        notify_event_updates = coalesce($8, notification_preferences.notify_event_updates),
        notify_search_alerts = coalesce($9, notification_preferences.notify_search_alerts),
        updated_at = now()
      returning email_enabled, digest_frequency, pause_until,
        notify_followed_hosts, notify_saved_reminders, notify_rsvp_reminders,
        notify_event_updates, notify_search_alerts`,
      [
        profile.id,
        d.emailEnabled ?? null,
        d.digestFrequency ?? null,
        d.pauseUntil ?? null,
        d.notifyFollowedHosts ?? null,
        d.notifySavedReminders ?? null,
        d.notifyRsvpReminders ?? null,
        d.notifyEventUpdates ?? null,
        d.notifySearchAlerts ?? null,
      ],
    );
    const row = result.rows[0];
    return {
      emailEnabled: row.email_enabled,
      digestFrequency: row.digest_frequency,
      pauseUntil: row.pause_until,
      notifyFollowedHosts: row.notify_followed_hosts,
      notifySavedReminders: row.notify_saved_reminders,
      notifyRsvpReminders: row.notify_rsvp_reminders,
      notifyEventUpdates: row.notify_event_updates,
      notifySearchAlerts: row.notify_search_alerts,
    };
  });
};

export default profileRoutes;
