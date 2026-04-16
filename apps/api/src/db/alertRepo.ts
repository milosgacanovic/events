import type { Pool } from "pg";

export type UserAlertRow = {
  id: string;
  user_id: string;
  organizer_id: string;
  radius_km: number;
  lat: string | null;
  lng: string | null;
  location_label: string | null;
  city: string | null;
  country_code: string | null;
  unsubscribe_token: string;
  unsubscribed_at: string | null;
  created_at: string;
};

const USER_ALERT_COLUMNS = `
  id,
  user_id,
  organizer_id,
  radius_km,
  lat,
  lng,
  location_label,
  city,
  country_code,
  unsubscribe_token,
  unsubscribed_at,
  created_at
`;

export type CreateUserAlertInput = {
  userId: string;
  organizerId: string;
  radiusKm: number;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  city?: string | null;
  countryCode?: string | null;
};

export async function createUserAlert(pool: Pool, input: CreateUserAlertInput): Promise<UserAlertRow> {
  const city = input.city?.trim() || null;
  const countryCode = input.countryCode?.trim().toLowerCase() || null;
  const lat = input.lat ?? null;
  const lng = input.lng ?? null;
  const locationLabel = input.locationLabel?.trim() || null;

  const result = await pool.query<UserAlertRow>(
    `
      insert into user_alerts (
        user_id,
        organizer_id,
        radius_km,
        lat,
        lng,
        location_label,
        city,
        country_code
      )
      values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
      on conflict (user_id, organizer_id, coalesce(city, ''), coalesce(country_code, ''), radius_km)
        do update set
          lat = coalesce(excluded.lat, user_alerts.lat),
          lng = coalesce(excluded.lng, user_alerts.lng),
          location_label = coalesce(excluded.location_label, user_alerts.location_label),
          unsubscribed_at = null
      returning ${USER_ALERT_COLUMNS}
    `,
    [input.userId, input.organizerId, input.radiusKm, lat, lng, locationLabel, city, countryCode],
  );
  return result.rows[0];
}

export async function updateUserAlert(
  pool: Pool,
  userId: string,
  alertId: string,
  input: Omit<CreateUserAlertInput, "userId" | "organizerId">,
): Promise<UserAlertRow | null> {
  const city = input.city?.trim() || null;
  const countryCode = input.countryCode?.trim().toLowerCase() || null;
  const locationLabel = input.locationLabel?.trim() || null;

  const result = await pool.query<UserAlertRow>(
    `
      update user_alerts
      set
        radius_km = $3,
        lat = $4,
        lng = $5,
        location_label = $6,
        city = $7,
        country_code = $8,
        unsubscribed_at = null
      where id = $1::uuid and user_id = $2::uuid
      returning ${USER_ALERT_COLUMNS}
    `,
    [
      alertId,
      userId,
      input.radiusKm,
      input.lat ?? null,
      input.lng ?? null,
      locationLabel,
      city,
      countryCode,
    ],
  );
  return result.rows[0] ?? null;
}

export async function listUserAlerts(pool: Pool, userId: string) {
  const result = await pool.query<
    UserAlertRow & {
      organizer_slug: string;
      organizer_name: string;
      organizer_image_url: string | null;
      organizer_practice: string | null;
      organizer_role: string | null;
    }
  >(
    `
      select
        ua.id,
        ua.user_id,
        ua.organizer_id,
        ua.radius_km,
        ua.lat,
        ua.lng,
        ua.location_label,
        ua.city,
        ua.country_code,
        ua.unsubscribe_token,
        ua.unsubscribed_at,
        ua.created_at,
        o.slug as organizer_slug,
        o.name as organizer_name,
        coalesce(o.image_url, o.avatar_path) as organizer_image_url,
        (select p.label from organizer_practices op
         join practices p on p.id = op.practice_id
         where op.organizer_id = o.id
         order by op.display_order limit 1) as organizer_practice,
        (select r.label from organizer_profile_roles opr
         join organizer_roles r on r.id = opr.role_id
         where opr.organizer_id = o.id
         order by opr.display_order limit 1) as organizer_role
      from user_alerts ua
      join organizers o on o.id = ua.organizer_id
      where ua.user_id = $1::uuid
      order by ua.created_at desc
    `,
    [userId],
  );
  return result.rows;
}

export async function getAlertForOrganizer(
  pool: Pool,
  userId: string,
  organizerId: string,
): Promise<UserAlertRow | null> {
  const result = await pool.query<UserAlertRow>(
    `
      select ${USER_ALERT_COLUMNS}
      from user_alerts
      where user_id = $1::uuid and organizer_id = $2::uuid
      order by created_at desc
      limit 1
    `,
    [userId, organizerId],
  );
  return result.rows[0] ?? null;
}

export async function deleteUserAlert(pool: Pool, userId: string, alertId: string): Promise<{ organizer_id: string } | null> {
  const result = await pool.query<{ organizer_id: string }>(
    `
      delete from user_alerts
      where id = $1::uuid
        and user_id = $2::uuid
      returning organizer_id
    `,
    [alertId, userId],
  );
  return result.rows[0] ?? null;
}

export async function unsubscribeByToken(pool: Pool, token: string): Promise<UserAlertRow | null> {
  const result = await pool.query<UserAlertRow>(
    `
      update user_alerts
      set unsubscribed_at = now()
      where unsubscribe_token = $1::uuid and unsubscribed_at is null
      returning ${USER_ALERT_COLUMNS}
    `,
    [token],
  );
  return result.rows[0] ?? null;
}

/**
 * Matches upcoming occurrences against alerts using PostGIS ST_DWithin. A row is returned
 * once per (alert × occurrence) pair — the worker groups by (user, alert) to form digests
 * and inserts `user_alert_sends` to dedupe across runs.
 *
 * Rules:
 *   - Skip alerts where `unsubscribed_at` is set.
 *   - Never notify about occurrences whose event.created_at predates the alert (otherwise
 *     creating a new alert would blast the user with everything already in our DB).
 *   - Anywhere-alert (lat is null) matches every occurrence for the host regardless of location.
 *   - Otherwise: ST_DWithin against `event_occurrences.geom` with ua.radius_km * 1000 metres.
 *   - `s.id is null` dedup against `user_alert_sends`.
 *   - Series dedup: if `events.series_id` is set, only the earliest-created published event
 *     in that series for the alerted host counts as "new" — sibling events in the same
 *     series are suppressed so followers aren't re-notified for every instance of an
 *     existing series they already know about.
 */
export type PendingNotificationRow = {
  alert_id: string;
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  unsubscribe_token: string;
  organizer_id: string;
  organizer_name: string;
  organizer_slug: string;
  radius_km: number;
  location_label: string | null;
  occurrence_id: string;
  event_id: string;
  event_slug: string;
  event_title: string;
  // pg driver returns timestamptz as Date.
  starts_at_utc: Date;
  event_timezone: string | null;
  occ_city: string | null;
  occ_country_code: string | null;
};

export async function listPendingNotifications(pool: Pool): Promise<PendingNotificationRow[]> {
  const result = await pool.query<PendingNotificationRow>(
    `
      select
        ua.id as alert_id,
        ua.user_id,
        u.email as user_email,
        u.display_name as user_display_name,
        ua.unsubscribe_token,
        ua.organizer_id,
        o.name as organizer_name,
        o.slug as organizer_slug,
        ua.radius_km,
        ua.location_label,
        eo.id as occurrence_id,
        e.id as event_id,
        e.slug as event_slug,
        e.title as event_title,
        eo.starts_at_utc,
        e.event_timezone,
        eo.city as occ_city,
        eo.country_code as occ_country_code
      from user_alerts ua
      join users u on u.id = ua.user_id
      join organizers o on o.id = ua.organizer_id
      join event_organizers rel on rel.organizer_id = ua.organizer_id
      join events e on e.id = rel.event_id
      join event_occurrences eo on eo.event_id = e.id
      left join user_alert_sends s on s.alert_id = ua.id and s.occurrence_id = eo.id
      where ua.unsubscribed_at is null
        and e.status = 'published'
        and eo.status = 'published'
        and eo.starts_at_utc > now()
        and e.created_at > ua.created_at
        and s.id is null
        and u.email is not null
        and (
          e.series_id is null
          or not exists (
            select 1
            from events e2
            join event_organizers rel2 on rel2.event_id = e2.id
            where rel2.organizer_id = ua.organizer_id
              and e2.series_id = e.series_id
              and e2.status = 'published'
              and e2.id <> e.id
              and e2.created_at < e.created_at
          )
        )
        and (
          ua.lat is null
          or ST_DWithin(
               eo.geom,
               ST_SetSRID(ST_MakePoint(ua.lng, ua.lat), 4326)::geography,
               ua.radius_km * 1000
             )
        )
      order by ua.user_id, ua.id, eo.starts_at_utc
    `,
  );
  return result.rows;
}

export async function markSent(
  pool: Pool,
  alertId: string,
  occurrenceIds: string[],
): Promise<number> {
  if (occurrenceIds.length === 0) return 0;
  const result = await pool.query(
    `
      insert into user_alert_sends (alert_id, occurrence_id)
      select $1::uuid, unnest($2::uuid[])
      on conflict (alert_id, occurrence_id) do nothing
    `,
    [alertId, occurrenceIds],
  );
  return result.rowCount ?? 0;
}

/**
 * Legacy dry-run endpoint used by `/admin/alerts/run-dry`. Kept so the admin UI
 * keeps working; delegates to the same PostGIS matching logic as the production
 * worker but without the dedup join (so admins can re-run it any time).
 */
export async function runAlertsDry(pool: Pool, nowIso: string, toIso: string) {
  const result = await pool.query<{
    alert_id: string;
    organizer_id: string;
    organizer_name: string;
    event_id: string;
    event_slug: string;
    event_title: string;
    occurrence_id: string;
    starts_at_utc: string;
    city: string | null;
    country_code: string | null;
  }>(
    `
      select
        ua.id as alert_id,
        ua.organizer_id,
        o.name as organizer_name,
        e.id as event_id,
        e.slug as event_slug,
        e.title as event_title,
        eo.id as occurrence_id,
        eo.starts_at_utc,
        eo.city,
        eo.country_code
      from user_alerts ua
      join organizers o on o.id = ua.organizer_id
      join event_organizers rel on rel.organizer_id = ua.organizer_id
      join events e on e.id = rel.event_id
      join event_occurrences eo on eo.event_id = e.id
      where ua.unsubscribed_at is null
        and e.status in ('published', 'cancelled')
        and eo.status = 'published'
        and eo.starts_at_utc >= $1::timestamptz
        and eo.starts_at_utc <= $2::timestamptz
        and (
          e.series_id is null
          or not exists (
            select 1
            from events e2
            join event_organizers rel2 on rel2.event_id = e2.id
            where rel2.organizer_id = ua.organizer_id
              and e2.series_id = e.series_id
              and e2.status = 'published'
              and e2.id <> e.id
              and e2.created_at < e.created_at
          )
        )
        and (
          ua.lat is null
          or ST_DWithin(
               eo.geom,
               ST_SetSRID(ST_MakePoint(ua.lng, ua.lat), 4326)::geography,
               ua.radius_km * 1000
             )
        )
      order by eo.starts_at_utc asc
    `,
    [nowIso, toIso],
  );

  return result.rows;
}
