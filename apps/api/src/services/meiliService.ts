import { MeiliSearch } from "meilisearch";

import type { Pool } from "pg";

import { extractEditorJsText } from "../utils/description";

export const OCCURRENCES_INDEX = "event_occurrences";

export type OccurrenceDoc = {
  occurrence_id: string;
  event_id: string;
  event_slug: string;
  title: string;
  description_text: string;
  starts_at_utc: string;
  ends_at_utc: string;
  attendance_mode: string;
  practice_category_id: string;
  practice_subcategory_id: string | null;
  tags: string[];
  languages: string[];
  organizer_ids: string[];
  organizer_names: string[];
  country_code: string | null;
  city: string | null;
  has_geo: boolean;
  geo: { lat: number; lng: number } | null;
  published_at: string | null;
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
      "practice_category_id",
      "practice_subcategory_id",
      "tags",
      "languages",
      "attendance_mode",
      "organizer_ids",
      "country_code",
      "city",
      "has_geo",
    ]);
    await index.updateSortableAttributes(["starts_at_utc", "published_at"]);
  }

  async healthcheck(): Promise<boolean> {
    try {
      await this.client.health();
      return true;
    } catch {
      return false;
    }
  }

  private async fetchOccurrenceDocs(pool: Pool, eventId?: string): Promise<OccurrenceDoc[]> {
    const query = `
      select
        eo.id as occurrence_id,
        e.id as event_id,
        e.slug as event_slug,
        e.title,
        e.description_json,
        eo.starts_at_utc,
        eo.ends_at_utc,
        e.attendance_mode,
        e.practice_category_id,
        e.practice_subcategory_id,
        e.tags,
        e.languages,
        eo.country_code,
        eo.city,
        eo.geom,
        e.published_at,
        coalesce(array_agg(distinct o.id) filter (where o.id is not null), '{}') as organizer_ids,
        coalesce(array_agg(distinct o.name) filter (where o.name is not null), '{}') as organizer_names
      from event_occurrences eo
      join events e on e.id = eo.event_id
      left join event_organizers eo2 on eo2.event_id = e.id
      left join organizers o on o.id = eo2.organizer_id
      where ($1::uuid is null or e.id = $1::uuid)
      group by eo.id, e.id
    `;

    const result = await pool.query<{
      occurrence_id: string;
      event_id: string;
      event_slug: string;
      title: string;
      description_json: unknown;
      starts_at_utc: string;
      ends_at_utc: string;
      attendance_mode: string;
      practice_category_id: string;
      practice_subcategory_id: string | null;
      tags: string[];
      languages: string[];
      country_code: string | null;
      city: string | null;
      geom: string | null;
      published_at: string | null;
      organizer_ids: string[];
      organizer_names: string[];
    }>(query, [eventId ?? null]);

    return result.rows.map((row) => {
      const geoMatch = row.geom?.match(/\(([-0-9.]+) ([-0-9.]+)\)/);
      const lng = geoMatch ? Number(geoMatch[1]) : null;
      const lat = geoMatch ? Number(geoMatch[2]) : null;

      return {
        occurrence_id: row.occurrence_id,
        event_id: row.event_id,
        event_slug: row.event_slug,
        title: row.title,
        description_text: extractEditorJsText(row.description_json),
        starts_at_utc: row.starts_at_utc,
        ends_at_utc: row.ends_at_utc,
        attendance_mode: row.attendance_mode,
        practice_category_id: row.practice_category_id,
        practice_subcategory_id: row.practice_subcategory_id,
        tags: row.tags,
        languages: row.languages,
        organizer_ids: row.organizer_ids,
        organizer_names: row.organizer_names,
        country_code: row.country_code,
        city: row.city,
        has_geo: Boolean(lat !== null && lng !== null),
        geo: lat !== null && lng !== null ? { lat, lng } : null,
        published_at: row.published_at,
      };
    });
  }

  async upsertOccurrencesForEvent(pool: Pool, eventId: string): Promise<void> {
    const docs = await this.fetchOccurrenceDocs(pool, eventId);
    const index = this.client.index(OCCURRENCES_INDEX);

    if (docs.length === 0) {
      await this.deleteOccurrencesByEventId(eventId);
      return;
    }

    await index.addDocuments(docs);
  }

  async deleteOccurrencesByEventId(eventId: string): Promise<void> {
    const index = this.client.index(OCCURRENCES_INDEX);
    await (index as unknown as { deleteDocumentsByFilter: (filter: string) => Promise<unknown> })
      .deleteDocumentsByFilter(`event_id = ${JSON.stringify(eventId)}`);
  }
}
