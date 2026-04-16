import type { Pool } from "pg";
import { buildEventDateRangeMap, type EventDatePreset, EVENT_DATE_PRESETS } from "../utils/eventDatePresets";

/**
 * Lists events the user can manage via 3 ownership paths:
 * 1. events.created_by_user_id = userId
 * 2. event linked to an organizer the user manages (via host_users)
 * 3. explicit event_users grant
 */
export async function listManagedEvents(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    visibility?: string;
    practiceCategoryId?: string;
    eventFormatId?: string;
    countryCode?: string;
    attendanceMode?: string;
    languages?: string;
    cities?: string;
    tags?: string;
    time?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [userId];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(e.title ilike $${idx} or e.slug ilike $${idx})`);
  }

  if (input.status) {
    const statuses = input.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      values.push(statuses[0]);
      whereParts.push(`e.status = $${values.length}`);
    } else if (statuses.length > 1) {
      values.push(statuses);
      whereParts.push(`e.status = ANY($${values.length}::text[])`);
    }
  }

  if (input.visibility) {
    values.push(input.visibility);
    whereParts.push(`e.visibility = $${values.length}`);
  }

  if (input.practiceCategoryId) {
    const ids = input.practiceCategoryId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`e.practice_category_id = $${values.length}`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`e.practice_category_id = ANY($${values.length}::uuid[])`);
    }
  }

  if (input.eventFormatId) {
    const ids = input.eventFormatId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`e.event_format_id = $${values.length}`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`e.event_format_id = ANY($${values.length}::uuid[])`);
    }
  }

  if (input.countryCode) {
    const codes = input.countryCode.split(",").map((s) => s.trim()).filter(Boolean);
    if (codes.length === 1) {
      values.push(codes[0]);
      whereParts.push(`exists(select 1 from event_locations el join locations loc on loc.id = el.location_id where el.event_id = e.id and upper(loc.country_code) = upper($${values.length}))`);
    } else if (codes.length > 1) {
      values.push(codes.map((c) => c.toUpperCase()));
      whereParts.push(`exists(select 1 from event_locations el join locations loc on loc.id = el.location_id where el.event_id = e.id and upper(loc.country_code) = ANY($${values.length}::text[]))`);
    }
  }

  if (input.attendanceMode) {
    const modes = input.attendanceMode.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(modes);
    whereParts.push(`e.attendance_mode = ANY($${values.length}::text[])`);
  }

  if (input.languages) {
    const langs = input.languages.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(langs);
    whereParts.push(`e.languages && $${values.length}::text[]`);
  }

  if (input.cities) {
    const cityList = input.cities.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(cityList);
    whereParts.push(`exists(select 1 from event_locations el2 join locations l2 on l2.id = el2.location_id where el2.event_id = e.id and l2.city = ANY($${values.length}::text[]))`);
  }

  if (input.tags) {
    const tagList = input.tags.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(tagList);
    whereParts.push(`e.tags && $${values.length}::text[]`);
  }

  if (input.time === "upcoming") {
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now()) or (e.schedule_kind = 'single' and e.single_start_at > now()))`);
  } else if (input.time === "past") {
    whereParts.push(`not (exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now()) or (e.schedule_kind = 'single' and e.single_start_at > now()))`);
  } else if (input.time === "next_7_days") {
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now() and oc.starts_at_utc < now() + interval '7 days') or (e.schedule_kind = 'single' and e.single_start_at > now() and e.single_start_at < now() + interval '7 days'))`);
  } else if (input.time === "next_30_days") {
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now() and oc.starts_at_utc < now() + interval '30 days') or (e.schedule_kind = 'single' and e.single_start_at > now() and e.single_start_at < now() + interval '30 days'))`);
  } else if (input.time && (EVENT_DATE_PRESETS as readonly string[]).includes(input.time)) {
    const ranges = buildEventDateRangeMap("UTC");
    const range = ranges[input.time as EventDatePreset];
    values.push(range.fromUtc, range.toUtc);
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc >= $${values.length - 1} and oc.starts_at_utc < $${values.length}) or (e.schedule_kind = 'single' and e.single_start_at >= $${values.length - 1} and e.single_start_at < $${values.length}))`);
  }

  if (input.dateFrom) {
    values.push(input.dateFrom);
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc >= $${values.length}::date) or (e.schedule_kind = 'single' and e.single_start_at >= $${values.length}::date))`);
  }
  if (input.dateTo) {
    values.push(input.dateTo);
    whereParts.push(`(exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc < ($${values.length}::date + interval '1 day')) or (e.schedule_kind = 'single' and e.single_start_at < ($${values.length}::date + interval '1 day')))`);
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const sortMap: Record<string, string> = {
    upcoming: "next_occ.starts_at_utc asc nulls last",
    edited: "e.updated_at desc",
    created: "e.created_at desc",
    title: "e.title asc",
  };
  const orderBy = sortMap[input.sort ?? ""] ?? "e.created_at desc";

  const ownershipCte = `
    with managed_event_ids as (
      select e.id from events e where e.created_by_user_id = $1
      union
      select eo.event_id as id
        from event_organizers eo
        join host_users hu on hu.organizer_id = eo.organizer_id
        where hu.user_id = $1
      union
      select eu.event_id as id from event_users eu where eu.user_id = $1
    )
  `;

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      title: string;
      status: string;
      attendance_mode: string;
      schedule_kind: string;
      event_format_id: string | null;
      is_imported: boolean;
      import_source: string | null;
      detached_from_import: boolean;
      cover_image_path: string | null;
      tags: string[] | null;
      visibility: "public" | "unlisted";
      updated_at: string;
      published_at: string | null;
      practice_category_label: string | null;
      event_format_label: string | null;
      event_format_key: string | null;
      location_city: string | null;
      location_country: string | null;
      next_occurrence: string | null;
      next_ends_at: string | null;
      event_timezone: string | null;
      host_names: string | null;
      created_by_name: string | null;
      save_count: number;
      rsvp_count: number;
    }>(
      `
        ${ownershipCte}
        select
          e.id, e.slug, e.title, e.status, e.attendance_mode,
          e.schedule_kind, e.event_format_id, e.visibility,
          e.is_imported, e.import_source, e.detached_from_import,
          e.cover_image_path, e.tags, e.updated_at, e.published_at,
          pc.label as practice_category_label,
          ef.label as event_format_label,
          ef.key as event_format_key,
          loc_sub.city as location_city,
          loc_sub.country_code as location_country,
          coalesce(next_occ.starts_at_utc, e.single_start_at) as next_occurrence,
          coalesce(next_occ.ends_at_utc, e.single_end_at) as next_ends_at,
          e.event_timezone,
          hosts_sub.host_names,
          u.display_name as created_by_name,
          coalesce(eng.save_count, 0)::int as save_count,
          coalesce(eng.rsvp_count, 0)::int as rsvp_count
        from events e
        join managed_event_ids m on m.id = e.id
        left join practices pc on pc.id = e.practice_category_id
        left join event_formats ef on ef.id = e.event_format_id
        left join lateral (
          select l.city, l.country_code
          from event_locations el
          join locations l on l.id = el.location_id
          where el.event_id = e.id
          limit 1
        ) loc_sub on true
        left join lateral (
          select string_agg(o.name, ', ' order by eo.display_order) as host_names
          from event_organizers eo
          join organizers o on o.id = eo.organizer_id
          where eo.event_id = e.id
        ) hosts_sub on true
        left join lateral (
          (select oc.starts_at_utc, oc.ends_at_utc from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now() order by oc.starts_at_utc limit 1)
          union all
          (select oc.starts_at_utc, oc.ends_at_utc from event_occurrences oc where oc.event_id = e.id order by oc.starts_at_utc desc limit 1)
          limit 1
        ) next_occ on true
        left join users u on u.id = e.created_by_user_id
        left join lateral (
          select
            (select count(*) from saved_events se where se.event_id = e.id) as save_count,
            (select count(*) from event_rsvps r where r.event_id = e.id) as rsvp_count
        ) eng on true
        where 1=1 ${extraWhere}
        order by ${orderBy}
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `
        ${ownershipCte}
        select count(*)::text as count
        from events e
        join managed_event_ids m on m.id = e.id
        where 1=1 ${extraWhere}
      `,
      values,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.count ?? "0");

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      totalItems: total,
    },
  };
}

/**
 * Lists organizers the user can manage:
 * 1. organizers.created_by_user_id = userId
 * 2. host_users grant
 */
export async function listManagedOrganizers(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    practiceCategoryId?: string;
    profileRoleId?: string;
    countryCode?: string;
    languages?: string;
    cities?: string;
    sort?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const sortMap: Record<string, string> = {
    edited: "o.updated_at desc",
    created: "o.created_at desc",
    name: "lower(o.name) asc",
  };
  const orderBy = sortMap[input.sort ?? ""] ?? "o.updated_at desc";

  const whereParts: string[] = [];
  const values: unknown[] = [userId];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`o.status = $${values.length}`);
  }

  if (input.practiceCategoryId) {
    const ids = input.practiceCategoryId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_practices op WHERE op.organizer_id = o.id AND op.practice_id = $${values.length})`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_practices op WHERE op.organizer_id = o.id AND op.practice_id = ANY($${values.length}::uuid[]))`);
    }
  }

  if (input.profileRoleId) {
    const ids = input.profileRoleId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_profile_roles opr WHERE opr.organizer_id = o.id AND opr.role_id = $${values.length})`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_profile_roles opr WHERE opr.organizer_id = o.id AND opr.role_id = ANY($${values.length}::uuid[]))`);
    }
  }

  if (input.countryCode) {
    const codes = input.countryCode.split(",").map((s) => s.trim()).filter(Boolean);
    if (codes.length === 1) {
      values.push(codes[0]);
      whereParts.push(`upper(o.country_code) = upper($${values.length})`);
    } else if (codes.length > 1) {
      values.push(codes.map((c) => c.toUpperCase()));
      whereParts.push(`upper(o.country_code) = ANY($${values.length}::text[])`);
    }
  }

  if (input.languages) {
    const langs = input.languages.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(langs);
    whereParts.push(`o.languages && $${values.length}::text[]`);
  }

  if (input.cities) {
    const cityList = input.cities.split(",").map((s) => s.trim()).filter(Boolean);
    values.push(cityList);
    whereParts.push(`EXISTS(SELECT 1 FROM organizer_locations ol WHERE ol.organizer_id = o.id AND ol.city = ANY($${values.length}::text[]))`);
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const ownershipCte = `
    with managed_org_ids as (
      select o.id from organizers o where o.created_by_user_id = $1
      union
      select hu.organizer_id as id from host_users hu where hu.user_id = $1
    )
  `;

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      image_url: string | null;
      avatar_path: string | null;
      city: string | null;
      country_code: string | null;
      updated_at: string;
      languages: string[] | null;
      practice_labels: string | null;
      role_labels: string | null;
      role_keys: string[] | null;
      event_count: string | null;
      follower_count: number;
    }>(
      `
        ${ownershipCte}
        select
          o.id, o.slug, o.name, o.status,
          o.image_url, o.avatar_path, o.city, o.country_code,
          o.updated_at, o.languages,
          practice_sub.practice_labels,
          role_sub.role_labels,
          role_sub.role_keys,
          event_count_sub.event_count,
          coalesce(follower_sub.follower_count, 0)::int as follower_count
        from organizers o
        join managed_org_ids m on m.id = o.id
        left join lateral (
          select string_agg(p.label, ', ' order by p.sort_order) as practice_labels
          from organizer_practices op
          join practices p on p.id = op.practice_id
          where op.organizer_id = o.id
        ) practice_sub on true
        left join lateral (
          select
            string_agg(r.label, ', ') as role_labels,
            array_agg(r.key order by r.key) as role_keys
          from organizer_profile_roles opr
          join organizer_roles r on r.id = opr.role_id
          where opr.organizer_id = o.id
        ) role_sub on true
        left join lateral (
          select count(*)::text as event_count
          from event_organizers eo
          where eo.organizer_id = o.id
        ) event_count_sub on true
        left join lateral (
          select count(*) as follower_count
          from user_alerts ua
          where ua.organizer_id = o.id and ua.unsubscribed_at is null
        ) follower_sub on true
        where 1=1 ${extraWhere}
        order by ${orderBy}
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `
        ${ownershipCte}
        select count(*)::text as count
        from organizers o
        join managed_org_ids m on m.id = o.id
        where 1=1 ${extraWhere}
      `,
      values,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.count ?? "0");

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      totalItems: total,
    },
  };
}

export type EventFacetFilters = {
  status?: string[];
  visibility?: string[];
  practiceCategoryIds?: string[];
  attendanceModes?: string[];
  eventFormatIds?: string[];
  languages?: string[];
  countryCodes?: string[];
  cities?: string[];
  tags?: string[];
};

export async function getEventFacets(
  pool: Pool,
  userId: string,
  filters: EventFacetFilters = {},
): Promise<{
  statuses: Record<string, number>;
  visibilities: Record<string, number>;
  attendanceModes: Record<string, number>;
  practiceCategoryIds: Record<string, number>;
  eventFormatIds: Record<string, number>;
  languages: Record<string, number>;
  countryCodes: Record<string, number>;
  cities: Record<string, number>;
  tags: Record<string, number>;
  timeCounts: Record<string, number>;
}> {
  const values: unknown[] = [userId];
  const filterClauses: string[] = [];

  if (filters.status?.length) {
    values.push(filters.status);
    filterClauses.push(`e.status = ANY($${values.length}::text[])`);
  }
  if (filters.visibility?.length) {
    values.push(filters.visibility);
    filterClauses.push(`e.visibility = ANY($${values.length}::text[])`);
  }
  if (filters.practiceCategoryIds?.length) {
    values.push(filters.practiceCategoryIds);
    filterClauses.push(`e.practice_category_id = ANY($${values.length}::uuid[])`);
  }
  if (filters.attendanceModes?.length) {
    values.push(filters.attendanceModes);
    filterClauses.push(`e.attendance_mode = ANY($${values.length}::text[])`);
  }
  if (filters.eventFormatIds?.length) {
    values.push(filters.eventFormatIds);
    filterClauses.push(`e.event_format_id = ANY($${values.length}::uuid[])`);
  }
  if (filters.languages?.length) {
    values.push(filters.languages);
    filterClauses.push(`e.languages && $${values.length}::text[]`);
  }
  if (filters.tags?.length) {
    values.push(filters.tags);
    filterClauses.push(`e.tags && $${values.length}::text[]`);
  }
  if (filters.countryCodes?.length) {
    values.push(filters.countryCodes);
    filterClauses.push(`exists (
      select 1 from event_locations el2
      join locations l2 on l2.id = el2.location_id
      where el2.event_id = e.id and upper(l2.country_code) = ANY($${values.length}::text[])
    )`);
  }
  if (filters.cities?.length) {
    values.push(filters.cities);
    filterClauses.push(`exists (
      select 1 from event_locations el3
      join locations l3 on l3.id = el3.location_id
      where el3.event_id = e.id and l3.city = ANY($${values.length}::text[])
    )`);
  }

  const filterWhere = filterClauses.length ? `and ${filterClauses.join(" and ")}` : "";

  const result = await pool.query<{ result: Record<string, unknown> }>(
    `
    with managed as (
      select e.id from events e where e.created_by_user_id = $1
      union
      select eo.event_id from event_organizers eo
        join host_users hu on hu.organizer_id = eo.organizer_id where hu.user_id = $1
      union
      select eu.event_id from event_users eu where eu.user_id = $1
    ),
    filtered as (
      select distinct m.id from managed m
      join events e on e.id = m.id
      where 1=1 ${filterWhere}
    )
    select json_build_object(
      'statuses', (
        select json_object_agg(v.s, coalesce(c.cnt, 0))
        from (values ('draft'), ('published'), ('cancelled'), ('archived')) as v(s)
        left join (
          select e.status, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          group by e.status
        ) c on c.status = v.s
      ),
      'visibilities', (
        select json_object_agg(v.s, coalesce(c.cnt, 0))
        from (values ('public'), ('unlisted')) as v(s)
        left join (
          select e.visibility, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          group by e.visibility
        ) c on c.visibility = v.s
      ),
      'attendanceModes', (
        select coalesce(json_object_agg(t.attendance_mode, t.cnt), '{}'::json)
        from (
          select e.attendance_mode, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          where e.attendance_mode is not null
          group by e.attendance_mode
        ) t
      ),
      'practiceCategoryIds', (
        select coalesce(json_object_agg(t.id::text, t.cnt), '{}'::json)
        from (
          select e.practice_category_id as id, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          where e.practice_category_id is not null
          group by e.practice_category_id
        ) t
      ),
      'eventFormatIds', (
        select coalesce(json_object_agg(t.id::text, t.cnt), '{}'::json)
        from (
          select e.event_format_id as id, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          where e.event_format_id is not null
          group by e.event_format_id
        ) t
      ),
      'languages', (
        select coalesce(json_object_agg(t.lang, t.cnt), '{}'::json)
        from (
          select lang, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          cross join unnest(e.languages) as lang
          group by lang
        ) t
      ),
      'countryCodes', (
        select coalesce(json_object_agg(t.country_code, t.cnt), '{}'::json)
        from (
          select upper(l.country_code) as country_code, count(distinct e.id)::int as cnt
          from events e
          join filtered f on f.id = e.id
          join event_locations el on el.event_id = e.id
          join locations l on l.id = el.location_id
          where l.country_code is not null
          group by upper(l.country_code)
        ) t
      ),
      'cities', (
        select coalesce(json_object_agg(t.city, t.cnt), '{}'::json)
        from (
          select l.city, count(distinct e.id)::int as cnt
          from events e
          join filtered f on f.id = e.id
          join event_locations el on el.event_id = e.id
          join locations l on l.id = el.location_id
          where l.city is not null and l.city != ''
          group by l.city
        ) t
      ),
      'tags', (
        select coalesce(json_object_agg(t.tag, t.cnt), '{}'::json)
        from (
          select tag, count(distinct e.id)::int as cnt
          from events e join filtered f on f.id = e.id
          cross join unnest(e.tags) as tag
          where tag is not null
          group by tag
        ) t
      ),
      'timeCounts', (
        select json_build_object(
          'upcoming', (
            select count(distinct e.id)::int from events e join filtered f on f.id = e.id
            where exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now())
               or (e.schedule_kind = 'single' and e.single_start_at > now())
          ),
          'next_7_days', (
            select count(distinct e.id)::int from events e join filtered f on f.id = e.id
            where exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now() and oc.starts_at_utc < now() + interval '7 days')
               or (e.schedule_kind = 'single' and e.single_start_at > now() and e.single_start_at < now() + interval '7 days')
          ),
          'next_30_days', (
            select count(distinct e.id)::int from events e join filtered f on f.id = e.id
            where exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now() and oc.starts_at_utc < now() + interval '30 days')
               or (e.schedule_kind = 'single' and e.single_start_at > now() and e.single_start_at < now() + interval '30 days')
          ),
          'past', (
            select count(distinct e.id)::int from events e join filtered f on f.id = e.id
            where not (
              exists(select 1 from event_occurrences oc where oc.event_id = e.id and oc.starts_at_utc > now())
              or (e.schedule_kind = 'single' and e.single_start_at > now())
            )
          )
        )
      )
    ) as result
    `,
    values,
  );
  const row = result.rows[0]?.result ?? {};
  return {
    statuses: (row.statuses as Record<string, number>) ?? {},
    visibilities: (row.visibilities as Record<string, number>) ?? {},
    attendanceModes: (row.attendanceModes as Record<string, number>) ?? {},
    practiceCategoryIds: (row.practiceCategoryIds as Record<string, number>) ?? {},
    eventFormatIds: (row.eventFormatIds as Record<string, number>) ?? {},
    languages: (row.languages as Record<string, number>) ?? {},
    countryCodes: (row.countryCodes as Record<string, number>) ?? {},
    cities: (row.cities as Record<string, number>) ?? {},
    tags: (row.tags as Record<string, number>) ?? {},
    timeCounts: (row.timeCounts as Record<string, number>) ?? {},
  };
}

export type HostFacetFilters = {
  status?: string;
  practiceCategoryIds?: string[];
  roleIds?: string[];
  languages?: string[];
  countryCodes?: string[];
  cities?: string[];
};

export async function getHostFacets(
  pool: Pool,
  userId: string,
  filters: HostFacetFilters = {},
): Promise<{
  statuses: Record<string, number>;
  practiceCategoryIds: Record<string, number>;
  roleIds: Record<string, number>;
  languages: Record<string, number>;
  countryCodes: Record<string, number>;
  cities: Record<string, number>;
}> {
  const values: unknown[] = [userId];
  const filterClauses: string[] = [];

  if (filters.status) {
    values.push(filters.status);
    filterClauses.push(`o.status = $${values.length}`);
  }
  if (filters.languages?.length) {
    values.push(filters.languages);
    filterClauses.push(`o.languages && $${values.length}::text[]`);
  }
  if (filters.countryCodes?.length) {
    values.push(filters.countryCodes);
    filterClauses.push(`upper(o.country_code) = ANY($${values.length}::text[])`);
  }
  if (filters.practiceCategoryIds?.length) {
    values.push(filters.practiceCategoryIds);
    filterClauses.push(`exists (
      select 1 from organizer_practices op2
      where op2.organizer_id = o.id and op2.practice_id = ANY($${values.length}::uuid[])
    )`);
  }
  if (filters.roleIds?.length) {
    values.push(filters.roleIds);
    filterClauses.push(`exists (
      select 1 from organizer_profile_roles opr2
      where opr2.organizer_id = o.id and opr2.role_id = ANY($${values.length}::uuid[])
    )`);
  }
  if (filters.cities?.length) {
    values.push(filters.cities);
    filterClauses.push(`exists (
      select 1 from organizer_locations ol2
      where ol2.organizer_id = o.id and ol2.city = ANY($${values.length}::text[])
    )`);
  }

  const filterWhere = filterClauses.length ? `and ${filterClauses.join(" and ")}` : "";

  const result = await pool.query<{ result: Record<string, unknown> }>(
    `
    with managed as (
      select o.id from organizers o where o.created_by_user_id = $1
      union
      select hu.organizer_id as id from host_users hu where hu.user_id = $1
    ),
    filtered as (
      select distinct m.id from managed m
      join organizers o on o.id = m.id
      where 1=1 ${filterWhere}
    )
    select json_build_object(
      'statuses', (
        select json_object_agg(v.s, coalesce(c.cnt, 0))
        from (values ('draft'), ('published'), ('archived')) as v(s)
        left join (
          select o.status, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          group by o.status
        ) c on c.status = v.s
      ),
      'practiceCategoryIds', (
        select coalesce(json_object_agg(t.id::text, t.cnt), '{}'::json)
        from (
          select op.practice_id as id, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          join organizer_practices op on op.organizer_id = o.id
          group by op.practice_id
        ) t
      ),
      'roleIds', (
        select coalesce(json_object_agg(t.id::text, t.cnt), '{}'::json)
        from (
          select opr.role_id as id, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          join organizer_profile_roles opr on opr.organizer_id = o.id
          group by opr.role_id
        ) t
      ),
      'languages', (
        select coalesce(json_object_agg(t.lang, t.cnt), '{}'::json)
        from (
          select lang, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          cross join unnest(o.languages) as lang
          group by lang
        ) t
      ),
      'countryCodes', (
        select coalesce(json_object_agg(t.country_code, t.cnt), '{}'::json)
        from (
          select upper(o.country_code) as country_code, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          where o.country_code is not null
          group by upper(o.country_code)
        ) t
      ),
      'cities', (
        select coalesce(json_object_agg(t.city, t.cnt), '{}'::json)
        from (
          select ol.city, count(distinct o.id)::int as cnt
          from organizers o join filtered f on f.id = o.id
          join organizer_locations ol on ol.organizer_id = o.id
          where ol.city is not null and ol.city != ''
          group by ol.city
        ) t
      )
    ) as result
    `,
    values,
  );
  const row = result.rows[0]?.result ?? {};
  return {
    statuses: (row.statuses as Record<string, number>) ?? {},
    practiceCategoryIds: (row.practiceCategoryIds as Record<string, number>) ?? {},
    roleIds: (row.roleIds as Record<string, number>) ?? {},
    languages: (row.languages as Record<string, number>) ?? {},
    countryCodes: (row.countryCodes as Record<string, number>) ?? {},
    cities: (row.cities as Record<string, number>) ?? {},
  };
}

export async function canUserEditEvent(
  pool: Pool,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const result = await pool.query<{ ok: boolean }>(
    `
      select exists(
        select 1 from events where id = $2 and created_by_user_id = $1
        union all
        select 1 from event_users where user_id = $1 and event_id = $2
        union all
        select 1
          from event_organizers eo
          join host_users hu on hu.organizer_id = eo.organizer_id
          where hu.user_id = $1 and eo.event_id = $2
      ) as ok
    `,
    [userId, eventId],
  );
  return result.rows[0]?.ok ?? false;
}

export async function canUserEditOrganizer(
  pool: Pool,
  userId: string,
  organizerId: string,
): Promise<boolean> {
  const result = await pool.query<{ ok: boolean }>(
    `
      select exists(
        select 1 from organizers where id = $2 and created_by_user_id = $1
        union all
        select 1 from host_users where user_id = $1 and organizer_id = $2
      ) as ok
    `,
    [userId, organizerId],
  );
  return result.rows[0]?.ok ?? false;
}

export async function getDashboardStats(
  pool: Pool,
  userId: string,
) {
  const [eventsResult, hostsResult, upcomingResult, activityResult] = await Promise.all([
    pool.query<{ count: string }>(
      `
        select count(distinct e.id)::text as count
        from events e
        left join event_organizers eo on eo.event_id = e.id
        left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
        left join event_users eu on eu.event_id = e.id and eu.user_id = $1
        where e.created_by_user_id = $1 or hu.id is not null or eu.id is not null
      `,
      [userId],
    ),
    pool.query<{ count: string }>(
      `
        select count(distinct o.id)::text as count
        from organizers o
        left join host_users hu on hu.organizer_id = o.id and hu.user_id = $1
        where o.created_by_user_id = $1 or hu.id is not null
      `,
      [userId],
    ),
    pool.query<{ count: string }>(
      `
        select count(distinct oc.event_id)::text as count
        from event_occurrences oc
        join events e on e.id = oc.event_id
        left join event_organizers eo on eo.event_id = e.id
        left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
        left join event_users eu on eu.event_id = e.id and eu.user_id = $1
        where (e.created_by_user_id = $1 or hu.id is not null or eu.id is not null)
          and oc.starts_at_utc > now()
          and e.status = 'published'
      `,
      [userId],
    ),
    pool.query<{
      entity_type: string;
      entity_id: string;
      entity_name: string;
      action: string;
      activity_at: string;
    }>(
      `
        (
          select 'event' as entity_type, e.id as entity_id, e.title as entity_name,
            case when e.created_at = e.updated_at then 'created' else 'updated' end as action,
            e.updated_at as activity_at
          from events e
          left join event_organizers eo on eo.event_id = e.id
          left join host_users hu on hu.organizer_id = eo.organizer_id and hu.user_id = $1
          left join event_users eu on eu.event_id = e.id and eu.user_id = $1
          where e.created_by_user_id = $1 or hu.id is not null or eu.id is not null
        )
        union all
        (
          select 'host' as entity_type, o.id as entity_id, o.name as entity_name,
            case when o.created_at = o.updated_at then 'created' else 'updated' end as action,
            o.updated_at as activity_at
          from organizers o
          left join host_users hu on hu.organizer_id = o.id and hu.user_id = $1
          where o.created_by_user_id = $1 or hu.id is not null
        )
        order by activity_at desc
        limit 5
      `,
      [userId],
    ),
  ]);

  return {
    totalEventsCount: Number(eventsResult.rows[0]?.count ?? "0"),
    hostsCount: Number(hostsResult.rows[0]?.count ?? "0"),
    upcomingEventsCount: Number(upcomingResult.rows[0]?.count ?? "0"),
    recentActivity: activityResult.rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityName: r.entity_name,
      action: r.action,
      activityAt: r.activity_at,
    })),
  };
}

export async function getAdminDashboardStats(pool: Pool) {
  const [events, hosts, editors, pendingApps, pendingMod, activeAlerts, totalSaves, totalRsvps] = await Promise.all([
    pool.query<{ count: string }>(`select count(*)::text as count from events`),
    pool.query<{ count: string }>(`select count(*)::text as count from organizers`),
    pool.query<{ count: string }>(`select count(*)::text as count from users`),
    pool.query<{ count: string }>(`select count(*)::text as count from editor_applications where status = 'pending'`),
    pool.query<{ count: string }>(`select count(*)::text as count from moderation_queue where status = 'pending'`),
    pool.query<{ count: string }>(`select count(*)::text as count from user_alerts where unsubscribed_at is null`),
    pool.query<{ count: string }>(`select count(*)::text as count from saved_events`),
    pool.query<{ count: string }>(`select count(*)::text as count from event_rsvps`),
  ]);

  return {
    totalEventsCount: Number(events.rows[0]?.count ?? "0"),
    totalHostsCount: Number(hosts.rows[0]?.count ?? "0"),
    totalUsersCount: Number(editors.rows[0]?.count ?? "0"),
    pendingApplicationsCount: Number(pendingApps.rows[0]?.count ?? "0"),
    pendingModerationCount: Number(pendingMod.rows[0]?.count ?? "0"),
    activeAlertsCount: Number(activeAlerts.rows[0]?.count ?? "0"),
    totalSavesCount: Number(totalSaves.rows[0]?.count ?? "0"),
    totalRsvpsCount: Number(totalRsvps.rows[0]?.count ?? "0"),
  };
}

export async function getAdminRecentActivity(pool: Pool) {
  const result = await pool.query<{
    entity_type: string;
    entity_id: string;
    entity_name: string;
    action: string;
    activity_at: string;
  }>(
    `
      (
        select 'event' as entity_type, e.id as entity_id, e.title as entity_name,
          case when e.created_at = e.updated_at then 'created' else 'updated' end as action,
          e.updated_at as activity_at
        from events e
      )
      union all
      (
        select 'host' as entity_type, o.id as entity_id, o.name as entity_name,
          case when o.created_at = o.updated_at then 'created' else 'updated' end as action,
          o.updated_at as activity_at
        from organizers o
      )
      order by activity_at desc
      limit 5
    `,
  );

  return result.rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityName: r.entity_name,
    action: r.action,
    activityAt: r.activity_at,
  }));
}

/**
 * Returns GeoJSON FeatureCollection of the user's managed events that have locations.
 */
export async function fetchManagedEventMapPoints(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    practiceCategoryId?: string;
  },
) {
  const values: unknown[] = [userId];
  const whereParts: string[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(e.title ilike $${idx} or e.slug ilike $${idx})`);
  }

  if (input.status) {
    const statuses = input.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      values.push(statuses[0]);
      whereParts.push(`e.status = $${values.length}`);
    } else if (statuses.length > 1) {
      values.push(statuses);
      whereParts.push(`e.status = ANY($${values.length}::text[])`);
    }
  }

  if (input.practiceCategoryId) {
    const ids = input.practiceCategoryId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`e.practice_category_id = $${values.length}`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`e.practice_category_id = ANY($${values.length}::uuid[])`);
    }
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const ownershipCte = `
    with managed_event_ids as (
      select e.id from events e where e.created_by_user_id = $1
      union
      select eo.event_id as id
        from event_organizers eo
        join host_users hu on hu.organizer_id = eo.organizer_id
        where hu.user_id = $1
      union
      select eu.event_id as id from event_users eu where eu.user_id = $1
    )
  `;

  const result = await pool.query<{
    event_id: string;
    event_slug: string;
    event_title: string;
    status: string;
    lat: number;
    lng: number;
  }>(
    `
      ${ownershipCte}
      select distinct on (e.id)
        e.id as event_id,
        e.slug as event_slug,
        e.title as event_title,
        e.status,
        st_y(loc.geom::geometry) as lat,
        st_x(loc.geom::geometry) as lng
      from events e
      join managed_event_ids m on m.id = e.id
      join event_locations el on el.event_id = e.id
      join locations loc on loc.id = el.location_id
      where loc.geom is not null
        ${extraWhere}
      order by e.id, el.location_id
      limit 500
    `,
    values,
  );

  return {
    type: "FeatureCollection" as const,
    features: result.rows.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.lng, r.lat],
      },
      properties: {
        event_id: r.event_id,
        event_slug: r.event_slug,
        event_title: r.event_title,
        status: r.status,
        lat: r.lat,
        lng: r.lng,
      },
    })),
  };
}

/**
 * Returns GeoJSON FeatureCollection of the user's managed organizers that have locations.
 */
export async function fetchManagedOrganizerMapPoints(
  pool: Pool,
  userId: string,
  input: {
    q?: string;
    status?: string;
    practiceCategoryId?: string;
  },
) {
  const values: unknown[] = [userId];
  const whereParts: string[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    const idx = values.length;
    whereParts.push(`(o.name ilike $${idx} or o.slug ilike $${idx})`);
  }

  if (input.status) {
    values.push(input.status);
    whereParts.push(`o.status = $${values.length}`);
  }

  if (input.practiceCategoryId) {
    const ids = input.practiceCategoryId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      values.push(ids[0]);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_practices op WHERE op.organizer_id = o.id AND op.practice_id = $${values.length})`);
    } else if (ids.length > 1) {
      values.push(ids);
      whereParts.push(`EXISTS(SELECT 1 FROM organizer_practices op WHERE op.organizer_id = o.id AND op.practice_id = ANY($${values.length}::uuid[]))`);
    }
  }

  const extraWhere = whereParts.length ? `and ${whereParts.join(" and ")}` : "";

  const ownershipCte = `
    with managed_org_ids as (
      select o.id from organizers o where o.created_by_user_id = $1
      union
      select hu.organizer_id as id from host_users hu where hu.user_id = $1
    )
  `;

  const result = await pool.query<{
    organizer_id: string;
    organizer_slug: string;
    organizer_name: string;
    status: string;
    lat: number;
    lng: number;
  }>(
    `
      ${ownershipCte}
      select distinct on (o.id)
        o.id as organizer_id,
        o.slug as organizer_slug,
        o.name as organizer_name,
        o.status,
        st_y(ol.geom::geometry) as lat,
        st_x(ol.geom::geometry) as lng
      from organizers o
      join managed_org_ids m on m.id = o.id
      join organizer_locations ol on ol.organizer_id = o.id
      where ol.geom is not null
        ${extraWhere}
      order by o.id, ol.created_at desc, ol.id desc
      limit 500
    `,
    values,
  );

  return {
    type: "FeatureCollection" as const,
    features: result.rows.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.lng, r.lat],
      },
      properties: {
        organizer_id: r.organizer_id,
        organizer_slug: r.organizer_slug,
        organizer_name: r.organizer_name,
        status: r.status,
        lat: r.lat,
        lng: r.lng,
      },
    })),
  };
}
