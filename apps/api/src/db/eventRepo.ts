import type { CreateEventInput, UpdateEventInput } from "@dr-events/shared";
import type { Pool } from "pg";

import type { EventOccurrenceRow, EventSeriesRow, LocationRow } from "../types/domain";
import { generateUniqueSlug } from "../utils/slug";

type EventSearchInput = {
  q?: string;
  from: string;
  to: string;
  practiceCategoryId?: string;
  practiceSubcategoryId?: string;
  eventFormatId?: string;
  tags?: string[];
  languages?: string[];
  attendanceMode?: "in_person" | "online" | "hybrid";
  organizerId?: string;
  countryCode?: string;
  countryCodes?: string[];
  city?: string;
  hasGeo?: boolean;
  page: number;
  pageSize: number;
  sort: "startsAtAsc" | "startsAtDesc" | "publishedAtDesc";
};

function buildEventFilters(input: Omit<EventSearchInput, "page" | "pageSize" | "sort">): {
  whereSql: string;
  values: unknown[];
} {
  const whereParts: string[] = [
    "e.status = 'published'",
    "eo.status = 'published'",
    "eo.starts_at_utc >= $1::timestamptz",
    "eo.starts_at_utc <= $2::timestamptz",
  ];
  const values: unknown[] = [input.from, input.to];

  if (input.q) {
    values.push(`%${input.q}%`);
    const index = values.length;
    whereParts.push(`(e.title ilike $${index} or e.slug ilike $${index})`);
  }

  if (input.practiceCategoryId) {
    values.push(input.practiceCategoryId);
    whereParts.push(`e.practice_category_id = $${values.length}::uuid`);
  }

  if (input.practiceSubcategoryId) {
    values.push(input.practiceSubcategoryId);
    whereParts.push(`e.practice_subcategory_id = $${values.length}::uuid`);
  }

  if (input.eventFormatId) {
    values.push(input.eventFormatId);
    whereParts.push(`e.event_format_id = $${values.length}::uuid`);
  }

  if (input.tags?.length) {
    values.push(input.tags);
    whereParts.push(`e.tags && $${values.length}::text[]`);
  }

  if (input.languages?.length) {
    values.push(input.languages);
    whereParts.push(`e.languages && $${values.length}::text[]`);
  }

  if (input.attendanceMode) {
    values.push(input.attendanceMode);
    whereParts.push(`e.attendance_mode = $${values.length}`);
  }

  if (input.organizerId) {
    values.push(input.organizerId);
    whereParts.push(`exists (select 1 from event_organizers rel where rel.event_id = e.id and rel.organizer_id = $${values.length}::uuid)`);
  }

  const normalizedCountryCodes = (
    input.countryCodes?.length ? input.countryCodes : input.countryCode ? [input.countryCode] : []
  )
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  if (normalizedCountryCodes.length === 1) {
    values.push(normalizedCountryCodes[0]);
    whereParts.push(`lower(eo.country_code) = $${values.length}`);
  } else if (normalizedCountryCodes.length > 1) {
    values.push(normalizedCountryCodes);
    whereParts.push(`lower(eo.country_code) = any($${values.length}::text[])`);
  }

  if (input.city) {
    values.push(input.city.toLowerCase());
    whereParts.push(`lower(eo.city) = $${values.length}`);
  }

  if (typeof input.hasGeo === "boolean") {
    whereParts.push(input.hasGeo ? "eo.geom is not null" : "eo.geom is null");
  }

  return {
    whereSql: whereParts.join(" and "),
    values,
  };
}

export async function createEvent(pool: Pool, createdByUserId: string | null, input: CreateEventInput) {
  const slug = await generateUniqueSlug(pool, "events", input.title);

  const result = await pool.query<EventSeriesRow>(
    `
      insert into events (
        slug,
        title,
        description_json,
        external_source,
        external_id,
        is_imported,
        import_source,
        cover_image_path,
        external_url,
        attendance_mode,
        online_url,
        practice_category_id,
        practice_subcategory_id,
        event_format_id,
        tags,
        languages,
        schedule_kind,
        event_timezone,
        single_start_at,
        single_end_at,
        rrule,
        rrule_dtstart_local,
        duration_minutes,
        status,
        visibility,
        created_by_user_id
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 'draft', $24, $25
      )
      returning *
    `,
    [
      slug,
      input.title,
      JSON.stringify(input.descriptionJson ?? {}),
      input.externalSource ?? null,
      input.externalId ?? null,
      input.isImported ?? false,
      input.importSource ?? null,
      input.coverImagePath ?? null,
      input.externalUrl ?? null,
      input.attendanceMode,
      input.onlineUrl ?? null,
      input.practiceCategoryId,
      input.practiceSubcategoryId ?? null,
      input.eventFormatId ?? null,
      input.tags,
      input.languages,
      input.scheduleKind,
      input.eventTimezone,
      input.singleStartAt ?? null,
      input.singleEndAt ?? null,
      input.rrule ?? null,
      input.rruleDtstartLocal ?? null,
      input.durationMinutes ?? null,
      input.visibility,
      createdByUserId,
    ],
  );

  return result.rows[0];
}

export async function updateEvent(pool: Pool, eventId: string, input: UpdateEventInput) {
  const fields: Record<string, unknown> = {
    title: input.title,
    description_json: input.descriptionJson ? JSON.stringify(input.descriptionJson) : undefined,
    external_source: input.externalSource,
    external_id: input.externalId,
    is_imported: input.isImported,
    import_source: input.importSource,
    cover_image_path: input.coverImagePath,
    external_url: input.externalUrl,
    attendance_mode: input.attendanceMode,
    online_url: input.onlineUrl,
    practice_category_id: input.practiceCategoryId,
    practice_subcategory_id: input.practiceSubcategoryId,
    event_format_id: input.eventFormatId,
    tags: input.tags,
    languages: input.languages,
    schedule_kind: input.scheduleKind,
    event_timezone: input.eventTimezone,
    single_start_at: input.singleStartAt,
    single_end_at: input.singleEndAt,
    rrule: input.rrule,
    rrule_dtstart_local: input.rruleDtstartLocal,
    duration_minutes: input.durationMinutes,
    visibility: input.visibility,
    status: input.status,
  };

  if (input.title) {
    fields.slug = await generateUniqueSlug(pool, "events", input.title, eventId);
  }

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const existing = await pool.query<EventSeriesRow>("select * from events where id = $1", [eventId]);
    return existing.rows[0] ?? null;
  }

  const values: unknown[] = [eventId];
  const setParts = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });

  const query = `
    update events
    set ${setParts.join(", ")}, updated_at = now()
    where id = $1
    returning *
  `;

  const result = await pool.query<EventSeriesRow>(query, values);
  return result.rows[0] ?? null;
}

export async function setEventOrganizers(
  pool: Pool,
  eventId: string,
  organizerRoles: Array<{ organizerId: string; roleId: string; displayOrder: number }>,
): Promise<void> {
  await pool.query("delete from event_organizers where event_id = $1", [eventId]);

  for (const row of organizerRoles) {
    await pool.query(
      `
        insert into event_organizers (event_id, organizer_id, role_id, display_order)
        values ($1, $2, $3, $4)
      `,
      [eventId, row.organizerId, row.roleId, row.displayOrder],
    );
  }
}

export async function setEventOrganizersByRoleKey(
  pool: Pool,
  eventId: string,
  organizerRoles: Array<{ organizerId: string; roleKey: string; displayOrder: number }>,
): Promise<{ ok: true } | { ok: false; missingRoleKeys: string[] }> {
  if (organizerRoles.length === 0) {
    await pool.query("delete from event_organizers where event_id = $1", [eventId]);
    return { ok: true };
  }

  const uniqueRoleKeys = Array.from(new Set(organizerRoles.map((row) => row.roleKey)));
  const roleRows = await pool.query<{ id: string; key: string }>(
    `
      select id, key
      from organizer_roles
      where key = any($1::text[])
        and is_active = true
    `,
    [uniqueRoleKeys],
  );
  const roleIdByKey = new Map(roleRows.rows.map((row) => [row.key, row.id]));
  const missingRoleKeys = uniqueRoleKeys.filter((key) => !roleIdByKey.has(key));
  if (missingRoleKeys.length > 0) {
    return { ok: false, missingRoleKeys };
  }

  await pool.query("delete from event_organizers where event_id = $1", [eventId]);
  for (const row of organizerRoles) {
    await pool.query(
      `
        insert into event_organizers (event_id, organizer_id, role_id, display_order)
        values ($1, $2, $3, $4)
      `,
      [eventId, row.organizerId, roleIdByKey.get(row.roleKey), row.displayOrder],
    );
  }

  return { ok: true };
}

export async function setEventStatus(
  pool: Pool,
  eventId: string,
  status: "draft" | "published" | "cancelled" | "archived",
): Promise<void> {
  await pool.query(
    `
      update events
      set
        status = $2,
        published_at = case when $2 = 'published' and published_at is null then now() else published_at end,
        updated_at = now()
      where id = $1
    `,
    [eventId, status],
  );
}

export async function getEventById(pool: Pool, eventId: string): Promise<EventSeriesRow | null> {
  const result = await pool.query<EventSeriesRow>("select * from events where id = $1", [eventId]);
  return result.rows[0] ?? null;
}

export async function getEventByExternalRef(
  pool: Pool,
  externalSource: string,
  externalId: string,
): Promise<EventSeriesRow | null> {
  const result = await pool.query<EventSeriesRow>(
    `
      select *
      from events
      where external_source = $1
        and external_id = $2
      limit 1
    `,
    [externalSource, externalId],
  );

  return result.rows[0] ?? null;
}

export async function getEventByIdWithLocation(
  pool: Pool,
  eventId: string,
): Promise<{ event: EventSeriesRow; location: LocationRow | null } | null> {
  const event = await getEventById(pool, eventId);
  if (!event) {
    return null;
  }

  const location = await pool.query<LocationRow>(
    `
      select
        l.id,
        l.label,
        l.formatted_address,
        l.country_code,
        l.city,
        st_y(l.geom::geometry) as lat,
        st_x(l.geom::geometry) as lng
      from event_locations el
      join locations l on l.id = el.location_id
      where el.event_id = $1
      limit 1
    `,
    [eventId],
  );

  return {
    event,
    location: location.rows[0] ?? null,
  };
}

export async function getEventBySlug(pool: Pool, slug: string) {
  const eventRes = await pool.query<EventSeriesRow & { event_format_key: string | null; event_format_label: string | null }>(
    `
      select e.*, ef.key as event_format_key, ef.label as event_format_label
      from events e
      left join event_formats ef on ef.id = e.event_format_id
      where e.slug = $1
        and e.status in ('published', 'cancelled')
      limit 1
    `,
    [slug],
  );

  const event = eventRes.rows[0];
  if (!event) {
    return null;
  }

  const organizers = await pool.query<{
    organizer_id: string;
    organizer_slug: string;
    organizer_name: string;
    organizer_avatar_path: string | null;
    role_id: string;
    role_key: string;
    role_label: string;
    display_order: number;
  }>(
    `
      select
        o.id as organizer_id,
        o.slug as organizer_slug,
        o.name as organizer_name,
        o.avatar_path as organizer_avatar_path,
        r.id as role_id,
        r.key as role_key,
        r.label as role_label,
        rel.display_order
      from event_organizers rel
      join organizers o on o.id = rel.organizer_id
      join organizer_roles r on r.id = rel.role_id
      where rel.event_id = $1
      order by rel.display_order asc, o.name asc
    `,
    [event.id],
  );

  const defaultLocation = await pool.query<{
    id: string;
    label: string | null;
    formatted_address: string;
    country_code: string | null;
    city: string | null;
    lat: number;
    lng: number;
  }>(
    `
      select
        l.id,
        l.label,
        l.formatted_address,
        l.country_code,
        l.city,
        st_y(l.geom::geometry) as lat,
        st_x(l.geom::geometry) as lng
      from event_locations el
      join locations l on l.id = el.location_id
      where el.event_id = $1
      limit 1
    `,
    [event.id],
  );

  const upcomingOccurrences = await pool.query<{
    id: string;
    starts_at_utc: string;
    ends_at_utc: string;
    status: string;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>(
    `
      select
        eo.id,
        eo.starts_at_utc,
        eo.ends_at_utc,
        eo.status,
        eo.city,
        eo.country_code,
        st_y(eo.geom::geometry) as lat,
        st_x(eo.geom::geometry) as lng
      from event_occurrences eo
      where eo.event_id = $1 and eo.starts_at_utc >= now()
      order by eo.starts_at_utc asc
      limit 10
    `,
    [event.id],
  );

  const pastOccurrences = await pool.query<{
    id: string;
    starts_at_utc: string;
    ends_at_utc: string;
    status: string;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>(
    `
      select
        eo.id,
        eo.starts_at_utc,
        eo.ends_at_utc,
        eo.status,
        eo.city,
        eo.country_code,
        st_y(eo.geom::geometry) as lat,
        st_x(eo.geom::geometry) as lng
      from event_occurrences eo
      where eo.event_id = $1 and eo.starts_at_utc < now()
      order by eo.starts_at_utc desc
      limit 5
    `,
    [event.id],
  );

  return {
    event,
    organizers: organizers.rows,
    defaultLocation: defaultLocation.rows[0] ?? null,
    occurrences: {
      upcoming: upcomingOccurrences.rows,
      past: pastOccurrences.rows,
    },
  };
}

export async function replaceOccurrencesInWindow(
  pool: Pool,
  eventId: string,
  fromIso: string,
  toIso: string,
  occurrences: EventOccurrenceRow[],
): Promise<void> {
  const scheduleResult = await pool.query<{ schedule_kind: "single" | "recurring" }>(
    `
      select schedule_kind
      from events
      where id = $1
      limit 1
    `,
    [eventId],
  );
  const isSingleEvent = scheduleResult.rows[0]?.schedule_kind === "single";

  if (isSingleEvent) {
    // Single-series events must have at most one occurrence at any time.
    await pool.query(`delete from event_occurrences where event_id = $1`, [eventId]);

    const single = occurrences[0];
    if (single) {
      await pool.query(
        `
          insert into event_occurrences (
            event_id,
            starts_at_utc,
            ends_at_utc,
            status,
            location_id,
            country_code,
            city,
            geom
          )
          values (
            $1,
            $2::timestamptz,
            $3::timestamptz,
            $4,
            $5::uuid,
            $6,
            $7,
            case
              when $8::double precision is not null and $9::double precision is not null
                then ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography
              else null
            end
          )
        `,
        [
          eventId,
          single.startsAtUtc,
          single.endsAtUtc,
          single.status,
          single.locationId,
          single.countryCode,
          single.city,
          single.lat,
          single.lng,
        ],
      );
    }

    // Safety cleanup in case concurrent writes occurred.
    await pool.query(
      `
        delete from event_occurrences o
        using (
          select id
          from (
            select
              id,
              row_number() over (
                order by updated_at desc, created_at desc, id desc
              ) as rn
            from event_occurrences
            where event_id = $1
          ) ranked
          where ranked.rn > 1
        ) duplicates
        where o.id = duplicates.id
      `,
      [eventId],
    );
    return;
  }

  await pool.query(
    `
      delete from event_occurrences
      where event_id = $1
        and starts_at_utc >= $2::timestamptz
        and starts_at_utc <= $3::timestamptz
    `,
    [eventId, fromIso, toIso],
  );

  for (const occurrence of occurrences) {
    await pool.query(
      `
        insert into event_occurrences (
          event_id,
          starts_at_utc,
          ends_at_utc,
          status,
          location_id,
          country_code,
          city,
          geom
        )
        values (
          $1,
          $2::timestamptz,
          $3::timestamptz,
          $4,
          $5::uuid,
          $6,
          $7,
          case
            when $8::double precision is not null and $9::double precision is not null
              then ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography
            else null
          end
        )
      `,
      [
        eventId,
        occurrence.startsAtUtc,
        occurrence.endsAtUtc,
        occurrence.status,
        occurrence.locationId,
        occurrence.countryCode,
        occurrence.city,
        occurrence.lat,
        occurrence.lng,
      ],
    );
  }
}

export async function deleteOccurrencesForEvent(pool: Pool, eventId: string): Promise<void> {
  await pool.query(`delete from event_occurrences where event_id = $1`, [eventId]);
}

export async function getRecurringPublishedEvents(pool: Pool): Promise<EventSeriesRow[]> {
  const result = await pool.query<EventSeriesRow>(
    `
      select *
      from events
      where schedule_kind = 'recurring'
        and status in ('published', 'cancelled')
    `,
  );

  return result.rows;
}

export async function searchEventsFallback(pool: Pool, input: EventSearchInput) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 50);
  const offset = (page - 1) * pageSize;

  const { whereSql, values } = buildEventFilters(input);
  const orderSql =
    input.sort === "publishedAtDesc"
      ? "published_at desc nulls last, starts_at_utc asc"
      : input.sort === "startsAtDesc"
        ? "starts_at_utc desc"
        : "starts_at_utc asc";

  const baseCte = `
    with matched as (
      select
        eo.id as occurrence_id,
        eo.starts_at_utc,
        eo.ends_at_utc,
        eo.status as occurrence_status,
        eo.city,
        eo.country_code,
        st_y(eo.geom::geometry) as lat,
        st_x(eo.geom::geometry) as lng,
        l.formatted_address,
        e.id as event_id,
        e.slug as event_slug,
        e.title,
        e.cover_image_path,
        e.is_imported,
        e.import_source,
        e.external_url,
        e.updated_at,
        e.attendance_mode,
        e.languages,
        e.tags,
        e.practice_category_id,
        e.practice_subcategory_id,
        e.event_format_id,
        e.published_at
      from event_occurrences eo
      join events e on e.id = eo.event_id
      left join locations l on l.id = eo.location_id
      where ${whereSql}
    )
  `;

  const totalResult = await pool.query<{ count: string }>(
    `${baseCte} select count(*)::text as count from matched`,
    values,
  );

  const hits = await pool.query<{
    occurrence_id: string;
    starts_at_utc: string;
    ends_at_utc: string;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
    formatted_address: string | null;
    event_id: string;
    event_slug: string;
    title: string;
    cover_image_path: string | null;
    is_imported: boolean;
    import_source: string | null;
    external_url: string | null;
    updated_at: string;
    attendance_mode: string;
    languages: string[];
    tags: string[];
    practice_category_id: string;
    practice_subcategory_id: string | null;
    event_format_id: string | null;
    published_at: string | null;
  }>(
    `${baseCte}
      select *
      from matched
      order by ${orderSql}
      limit $${values.length + 1}
      offset $${values.length + 2}
    `,
    [...values, pageSize, offset],
  );

  const eventIds = Array.from(new Set(hits.rows.map((row) => row.event_id)));

  const organizerRows =
    eventIds.length > 0
      ? await pool.query<{
          event_id: string;
          organizer_id: string;
          organizer_name: string;
          organizer_avatar_path: string | null;
          role_key: string;
        }>(
          `
            select
              rel.event_id,
              o.id as organizer_id,
              o.name as organizer_name,
              o.avatar_path as organizer_avatar_path,
              r.key as role_key
            from event_organizers rel
            join organizers o on o.id = rel.organizer_id
            join organizer_roles r on r.id = rel.role_id
            where rel.event_id = any($1::uuid[])
          `,
          [eventIds],
        )
      : { rows: [] as Array<never> };

  const organizerByEvent = new Map<
    string,
    Map<string, { id: string; name: string; avatarUrl: string | null; roles: string[] }>
  >();

  for (const row of organizerRows.rows as Array<{
    event_id: string;
    organizer_id: string;
    organizer_name: string;
    organizer_avatar_path: string | null;
    role_key: string;
  }>) {
    if (!organizerByEvent.has(row.event_id)) {
      organizerByEvent.set(row.event_id, new Map());
    }

    const eventMap = organizerByEvent.get(row.event_id)!;
    const existing = eventMap.get(row.organizer_id);

    if (existing) {
      existing.roles.push(row.role_key);
    } else {
      eventMap.set(row.organizer_id, {
        id: row.organizer_id,
        name: row.organizer_name,
        avatarUrl: row.organizer_avatar_path,
        roles: [row.role_key],
      });
    }
  }

  const facetCategory = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select practice_category_id::text as key, count(*)::text as count
      from matched
      group by practice_category_id
    `,
    values,
  );

  const facetSubcategory = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select practice_subcategory_id::text as key, count(*)::text as count
      from matched
      where practice_subcategory_id is not null
      group by practice_subcategory_id
    `,
    values,
  );

  const facetEventFormat = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select event_format_id::text as key, count(*)::text as count
      from matched
      where event_format_id is not null
      group by event_format_id
    `,
    values,
  );

  const facetLanguage = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select language as key, count(*)::text as count
      from matched
      cross join unnest(languages) language
      group by language
    `,
    values,
  );

  const facetAttendance = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select attendance_mode as key, count(*)::text as count
      from matched
      group by attendance_mode
    `,
    values,
  );

  const facetCountry = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select lower(country_code) as key, count(*)::text as count
      from matched
      where country_code is not null
      group by lower(country_code)
    `,
    values,
  );

  const facetTags = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select tag as key, count(*)::text as count
      from matched
      cross join unnest(tags) tag
      group by tag
    `,
    values,
  );

  const facetOrganizer = await pool.query<{ key: string; count: string }>(
    `${baseCte}
      select
        rel.organizer_id::text as key,
        count(distinct matched.occurrence_id)::text as count
      from matched
      join event_organizers rel on rel.event_id = matched.event_id
      group by rel.organizer_id
    `,
    values,
  );

  const totalHits = Number(totalResult.rows[0]?.count ?? "0");

  return {
    hits: hits.rows.map((row) => ({
      occurrenceId: row.occurrence_id,
      startsAtUtc: row.starts_at_utc,
      endsAtUtc: row.ends_at_utc,
      event: {
        id: row.event_id,
        slug: row.event_slug,
        title: row.title,
        coverImageUrl: row.cover_image_path,
        attendanceMode: row.attendance_mode,
        languages: row.languages,
        tags: row.tags,
        practiceCategoryId: row.practice_category_id,
        practiceSubcategoryId: row.practice_subcategory_id,
        eventFormatId: row.event_format_id,
        isImported: row.is_imported,
        importSource: row.import_source,
        externalUrl: row.external_url,
        lastSyncedAt: row.updated_at,
      },
      location: row.formatted_address
        ? {
            formatted_address: row.formatted_address,
            city: row.city,
            country_code: row.country_code,
            lat: row.lat,
            lng: row.lng,
          }
        : null,
      organizers: Array.from(organizerByEvent.get(row.event_id)?.values() ?? []),
    })),
    totalHits,
    facets: {
      practiceCategoryId: Object.fromEntries(
        facetCategory.rows.map((row) => [row.key, Number(row.count)]),
      ),
      practiceSubcategoryId: Object.fromEntries(
        facetSubcategory.rows.map((row) => [row.key, Number(row.count)]),
      ),
      eventFormatId: Object.fromEntries(
        facetEventFormat.rows.map((row) => [row.key, Number(row.count)]),
      ),
      languages: Object.fromEntries(facetLanguage.rows.map((row) => [row.key, Number(row.count)])),
      attendanceMode: Object.fromEntries(
        facetAttendance.rows.map((row) => [row.key, Number(row.count)]),
      ),
      countryCode: Object.fromEntries(facetCountry.rows.map((row) => [row.key, Number(row.count)])),
      tags: Object.fromEntries(facetTags.rows.map((row) => [row.key, Number(row.count)])),
      organizerId: Object.fromEntries(
        facetOrganizer.rows.map((row) => [row.key, Number(row.count)]),
      ),
    },
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(totalHits / pageSize), 1),
    },
  };
}
