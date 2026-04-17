import { MeiliSearch } from "meilisearch";

import type { Pool } from "pg";

import { config } from "../config";
import { fetchAllEventSeries, getEventSeriesBySeriesId, type EventSeriesDocRow } from "../db/seriesRepo";
import { extractEditorJsText } from "../utils/description";

export const OCCURRENCES_INDEX = "event_occurrences";
export const SERIES_INDEX = "event_series";

/**
 * One Meili doc per series (vs. one per occurrence in the old index). With this
 * shape the search route can stop doing SQL distinct math: native Meili totals
 * + facet counts are exact because each doc is already a series.
 *
 * Date filtering works through `upcoming_dates` — a pre-computed UTC date[]
 * bucket array on the Postgres row. The search route expands a user's
 * date-range preset into a list of YYYY-MM-DD strings and ORs them into the
 * Meili filter expression.
 */
export type SeriesDoc = {
  series_id: string;
  canonical_event_id: string;
  title: string;
  slug: string;
  cover_image_path: string | null;
  description_text: string;
  practice_category_id: string | null;
  practice_subcategory_id: string | null;
  event_format_id: string | null;
  attendance_mode: string;
  schedule_kind: string;
  event_timezone: string;
  country_code: string | null;
  city: string | null;
  _geo: { lat: number; lng: number } | null;
  has_geo: boolean;
  tags: string[];
  languages: string[];
  organizer_ids: string[];
  organizers: Array<{
    id: string;
    slug: string;
    name: string;
    avatarUrl: string | null;
    roles: string[];
  }>;
  upcoming_dates: string[];
  event_date_buckets: string[];
  earliest_upcoming_ts: number | null;
  earliest_upcoming_end_ts: number | null;
  upcoming_count: number;
  sibling_count: number;
  visibility: string;
};

export type OccurrenceDoc = {
  occurrence_id: string;
  event_id: string;
  event_slug: string;
  series_id: string;
  title: string;
  cover_image_path: string | null;
  is_imported: boolean;
  import_source: string | null;
  external_url: string | null;
  updated_at: string;
  description_text: string;
  starts_at_utc: string;
  starts_at_ts: number;
  ends_at_utc: string;
  ends_at_ts: number;
  attendance_mode: string;
  event_timezone: string;
  practice_category_id: string;
  practice_subcategory_id: string | null;
  event_format_id: string | null;
  tags: string[];
  languages: string[];
  organizer_ids: string[];
  organizer_names: string[];
  country_code: string | null;
  city: string | null;
  has_geo: boolean;
  _geo: { lat: number; lng: number } | null;
  published_at: string | null;
  published_at_ts: number | null;
  visibility: string;
  schedule_kind: "single" | "recurring";
  /** Number of published events sharing this series_id (including self).
   * Lets cards show a "Recurring" chip when sibling_count > 1 without an
   * extra search-time query. Computed as a scalar subquery so partial
   * per-event upserts stay correct. */
  sibling_count: number;
};

export class MeilisearchService {
  readonly client: MeiliSearch;

  constructor(url: string, apiKey?: string) {
    this.client = new MeiliSearch({
      host: url,
      apiKey,
    });
  }

  async ensureIndex(): Promise<void> {
    await this.client.createIndex(OCCURRENCES_INDEX, { primaryKey: "occurrence_id" }).catch(() => {});

    const index = this.client.index(OCCURRENCES_INDEX);
    await index.updateFilterableAttributes([
      "starts_at_utc",
      "starts_at_ts",
      "practice_category_id",
      "practice_subcategory_id",
      "event_format_id",
      "tags",
      "languages",
      "attendance_mode",
      "organizer_ids",
      "country_code",
      "city",
      "has_geo",
      "_geo",
      "visibility",
      "event_id",
      "series_id",
    ]);
    await index.updateSortableAttributes(["starts_at_utc", "starts_at_ts", "published_at", "published_at_ts"]);
    await index.updatePagination({ maxTotalHits: 50000 });
    // Series grouping: when the flag is on, Meili returns at most one hit
    // per series. When off, clear the distinct attribute so every occurrence
    // surfaces independently. Flag changes take effect on next API boot.
    if (config.EVENTS_SERIES_GROUPING_ENABLED) {
      await index.updateDistinctAttribute("series_id");
    } else {
      await index.updateDistinctAttribute(null);
    }

    // Series index: one doc per series_id. No distinctAttribute needed —
    // every doc is already a unique series, so native totalHits and
    // facetDistribution are exact by construction.
    await this.client.createIndex(SERIES_INDEX, { primaryKey: "series_id" }).catch(() => {});
    const seriesIndex = this.client.index(SERIES_INDEX);
    await seriesIndex.updateFilterableAttributes([
      "practice_category_id",
      "practice_subcategory_id",
      "event_format_id",
      "attendance_mode",
      "schedule_kind",
      "tags",
      "languages",
      "country_code",
      "city",
      "organizer_ids",
      "upcoming_dates",
      "event_date_buckets",
      "earliest_upcoming_ts",
      "has_geo",
      "_geo",
      "visibility",
      "canonical_event_id",
    ]);
    await seriesIndex.updateSortableAttributes(["earliest_upcoming_ts"]);
    await seriesIndex.updateSearchableAttributes(["title", "description_text", "tags"]);
    await seriesIndex.updatePagination({ maxTotalHits: 50000 });
  }

  async healthcheck(): Promise<boolean> {
    try {
      await this.client.health();
      return true;
    } catch {
      return false;
    }
  }

  async multiSearchSeries(
    queries: Array<{
      q?: string;
      filter?: string[];
      facets?: string[];
      sort?: string[];
      hitsPerPage?: number;
      page?: number;
      attributesToRetrieve?: string[];
    }>,
  ): Promise<
    Array<{
      hits: SeriesDoc[];
      totalHits?: number;
      facetDistribution?: Record<string, Record<string, number>>;
    }>
  > {
    const response = await this.client.multiSearch({
      queries: queries.map((query) => ({ indexUid: SERIES_INDEX, ...query })),
    });
    return response.results as unknown as Array<{
      hits: SeriesDoc[];
      totalHits?: number;
      facetDistribution?: Record<string, Record<string, number>>;
    }>;
  }

  async fetchOccurrenceDocs(pool: Pool, eventId?: string): Promise<OccurrenceDoc[]> {
    const query = `
      select
        eo.id as occurrence_id,
        e.id as event_id,
        e.slug as event_slug,
        eo.series_id,
        e.title,
        e.cover_image_path,
        e.is_imported,
        e.import_source,
        e.external_url,
        e.updated_at,
        e.description_json,
        eo.starts_at_utc,
        eo.ends_at_utc,
        e.attendance_mode,
        e.event_timezone,
        e.practice_category_id,
        e.practice_subcategory_id,
        e.event_format_id,
        e.tags,
        e.languages,
        e.visibility,
        e.schedule_kind,
        (
          select count(*)::int
          from events e2
          where e2.series_id = eo.series_id
            and e2.status = 'published'
        ) as sibling_count,
        eo.country_code,
        eo.city,
        ST_AsText(eo.geom) as geom,
        e.published_at,
        coalesce(array_agg(distinct o.id) filter (where o.id is not null), '{}') as organizer_ids,
        coalesce(array_agg(distinct o.name) filter (where o.name is not null), '{}') as organizer_names
      from event_occurrences eo
      join events e on e.id = eo.event_id
      left join event_organizers eo2 on eo2.event_id = e.id
      left join organizers o on o.id = eo2.organizer_id and o.status = 'published'
      where ($1::uuid is null or e.id = $1::uuid)
        and e.status = 'published'
      group by eo.id, e.id
    `;

    const result = await pool.query<{
      occurrence_id: string;
      event_id: string;
      event_slug: string;
      series_id: string;
      title: string;
      cover_image_path: string | null;
      is_imported: boolean;
      import_source: string | null;
      external_url: string | null;
      updated_at: string;
      description_json: unknown;
      starts_at_utc: string;
      ends_at_utc: string;
      attendance_mode: string;
      event_timezone: string;
      practice_category_id: string;
      practice_subcategory_id: string | null;
      event_format_id: string | null;
      tags: string[];
      languages: string[];
      visibility: string;
      country_code: string | null;
      city: string | null;
      geom: string | null;
      published_at: string | null;
      organizer_ids: string[];
      organizer_names: string[];
      schedule_kind: "single" | "recurring";
      sibling_count: number;
    }>(query, [eventId ?? null]);

    return result.rows.map((row) => {
      const geoMatch = row.geom?.match(/\(([-0-9.]+) ([-0-9.]+)\)/);
      const lng = geoMatch ? Number(geoMatch[1]) : null;
      const lat = geoMatch ? Number(geoMatch[2]) : null;

      return {
        occurrence_id: row.occurrence_id,
        event_id: row.event_id,
        event_slug: row.event_slug,
        series_id: row.series_id,
        title: row.title,
        cover_image_path: row.cover_image_path,
        is_imported: row.is_imported,
        import_source: row.import_source,
        external_url: row.external_url,
        updated_at: row.updated_at,
        description_text: extractEditorJsText(row.description_json),
        starts_at_utc: row.starts_at_utc,
        starts_at_ts: Date.parse(row.starts_at_utc),
        ends_at_utc: row.ends_at_utc,
        ends_at_ts: Date.parse(row.ends_at_utc),
        attendance_mode: row.attendance_mode,
        event_timezone: row.event_timezone,
        practice_category_id: row.practice_category_id,
        practice_subcategory_id: row.practice_subcategory_id,
        event_format_id: row.event_format_id,
        tags: row.tags.map((t: string) => t.toLowerCase()),
        languages: row.languages,
        visibility: row.visibility,
        organizer_ids: row.organizer_ids,
        organizer_names: row.organizer_names,
        country_code: row.country_code,
        city: row.city,
        has_geo: Boolean(lat !== null && lng !== null),
        _geo: lat !== null && lng !== null ? { lat, lng } : null,
        published_at: row.published_at,
        published_at_ts: row.published_at ? Date.parse(row.published_at) : null,
        schedule_kind: row.schedule_kind,
        sibling_count: row.sibling_count,
      };
    });
  }

  async upsertOccurrencesForEvent(pool: Pool, eventId: string): Promise<void> {
    const docs = await this.fetchOccurrenceDocs(pool, eventId);
    const index = this.client.index(OCCURRENCES_INDEX);

    await this.deleteOccurrencesByEventId(eventId);

    if (docs.length > 0) {
      await index.addDocuments(docs);
    }
  }

  async deleteOccurrencesByEventId(eventId: string): Promise<void> {
    const index = this.client.index(OCCURRENCES_INDEX);
    const task = await index.deleteDocuments({ filter: `event_id = ${JSON.stringify(eventId)}` });
    await this.client.waitForTask(task.taskUid, { timeOutMs: 30000 });
  }

  /**
   * Read the current `event_series` row for `seriesId` from Postgres and push
   * the resulting Meili doc to the `series` index. No-op if the row was
   * deleted (caller should use {@link deleteSeriesDoc} in that case).
   */
  async upsertSeriesDoc(pool: Pool, seriesId: string): Promise<void> {
    const row = await getEventSeriesBySeriesId(pool, seriesId);
    if (!row) {
      // Row was deleted — fall through without an error. Caller deletes
      // the Meili doc explicitly via deleteSeriesDoc.
      return;
    }
    const doc = this.toSeriesDoc(row);
    const index = this.client.index(SERIES_INDEX);
    await index.addDocuments([doc]);
  }

  /**
   * Delete the Meili doc for `seriesId` from the `series` index. Used when
   * `refreshEventSeries` returned `false` (series has no published/cancelled
   * siblings left).
   */
  async deleteSeriesDoc(seriesId: string): Promise<void> {
    const index = this.client.index(SERIES_INDEX);
    await index.deleteDocument(seriesId);
  }

  /**
   * Fetch all series docs from Postgres for the reindex script. Returns
   * Meili-ready docs (with `_geo` and timestamp numerics).
   */
  async fetchSeriesDocs(pool: Pool, batchSize = 1000, offset = 0): Promise<SeriesDoc[]> {
    const rows = await fetchAllEventSeries(pool, { batchSize, offset });
    return rows.map((row) => this.toSeriesDoc(row));
  }

  private toSeriesDoc(row: EventSeriesDocRow): SeriesDoc {
    return {
      series_id: row.series_id,
      canonical_event_id: row.canonical_event_id,
      title: row.title,
      slug: row.slug,
      cover_image_path: row.cover_image_path,
      description_text: extractEditorJsText(row.description_json),
      practice_category_id: row.practice_category_id,
      practice_subcategory_id: row.practice_subcategory_id,
      event_format_id: row.event_format_id,
      attendance_mode: row.attendance_mode,
      schedule_kind: row.schedule_kind,
      event_timezone: row.event_timezone,
      country_code: row.country_code,
      city: row.city,
      _geo: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
      has_geo: row.has_geo,
      tags: row.tags.map((t) => t.toLowerCase()),
      languages: row.languages,
      organizer_ids: row.organizer_ids,
      organizers: row.organizers_json,
      upcoming_dates: row.upcoming_dates,
      event_date_buckets: row.event_date_buckets,
      earliest_upcoming_ts: row.earliest_upcoming_ts ? Date.parse(row.earliest_upcoming_ts) : null,
      earliest_upcoming_end_ts: row.earliest_upcoming_end_ts ? Date.parse(row.earliest_upcoming_end_ts) : null,
      upcoming_count: row.upcoming_count,
      sibling_count: row.sibling_count,
      visibility: row.visibility,
    };
  }
}
