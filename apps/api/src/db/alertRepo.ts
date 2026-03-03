import type { Pool } from "pg";

export type UserAlertRow = {
  id: string;
  user_id: string;
  organizer_id: string;
  radius_km: number;
  city: string | null;
  country_code: string | null;
  created_at: string;
};

export async function createUserAlert(
  pool: Pool,
  input: {
    userId: string;
    organizerId: string;
    radiusKm: number;
    city?: string | null;
    countryCode?: string | null;
  },
): Promise<UserAlertRow> {
  const result = await pool.query<UserAlertRow>(
    `
      insert into user_alerts (
        user_id,
        organizer_id,
        radius_km,
        city,
        country_code
      )
      values ($1::uuid, $2::uuid, $3, $4, $5)
      returning *
    `,
    [
      input.userId,
      input.organizerId,
      input.radiusKm,
      input.city?.trim() || null,
      input.countryCode?.trim().toLowerCase() || null,
    ],
  );
  return result.rows[0];
}

export async function listUserAlerts(pool: Pool, userId: string) {
  const result = await pool.query<
    UserAlertRow & {
      organizer_slug: string;
      organizer_name: string;
      organizer_image_url: string | null;
    }
  >(
    `
      select
        ua.*,
        o.slug as organizer_slug,
        o.name as organizer_name,
        coalesce(o.image_url, o.avatar_path) as organizer_image_url
      from user_alerts ua
      join organizers o on o.id = ua.organizer_id
      where ua.user_id = $1::uuid
      order by ua.created_at desc
    `,
    [userId],
  );
  return result.rows;
}

export async function deleteUserAlert(pool: Pool, userId: string, alertId: string): Promise<boolean> {
  const result = await pool.query(
    `
      delete from user_alerts
      where id = $1::uuid
        and user_id = $2::uuid
    `,
    [alertId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

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
      where e.status in ('published', 'cancelled')
        and eo.status = 'published'
        and eo.starts_at_utc >= $1::timestamptz
        and eo.starts_at_utc <= $2::timestamptz
        and (
          ua.city is null
          or lower(eo.city) = lower(ua.city)
        )
        and (
          ua.country_code is null
          or lower(eo.country_code) = lower(ua.country_code)
        )
      order by eo.starts_at_utc asc
    `,
    [nowIso, toIso],
  );

  return result.rows;
}
