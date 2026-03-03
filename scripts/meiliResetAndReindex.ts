import { MeiliSearch } from "meilisearch";
import { Client } from "pg";

import { OCCURRENCES_INDEX } from "../apps/api/src/services/meiliService";

function extractEditorJsText(descriptionJson: unknown): string {
  if (!descriptionJson || typeof descriptionJson !== "object") {
    return "";
  }

  const maybeBlocks = (descriptionJson as { blocks?: unknown }).blocks;
  if (!Array.isArray(maybeBlocks)) {
    return "";
  }

  const textParts: string[] = [];

  for (const block of maybeBlocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const data = (block as { data?: unknown }).data;
    if (!data || typeof data !== "object") {
      continue;
    }

    for (const value of Object.values(data)) {
      if (typeof value === "string") {
        textParts.push(value);
      } else if (Array.isArray(value)) {
        for (const nestedValue of value) {
          if (typeof nestedValue === "string") {
            textParts.push(nestedValue);
          }
        }
      }
    }
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

const batchSize = 500;

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dr_events:dr_events_password@localhost:15432/dr_events";
const meiliUrl = process.env.MEILI_URL ?? "http://localhost:17700";
const meiliMasterKey = process.env.MEILI_MASTER_KEY ?? "change_me";

async function main() {
  const db = new Client({ connectionString: databaseUrl });
  const meili = new MeiliSearch({ host: meiliUrl, apiKey: meiliMasterKey });

  await db.connect();

  try {
    const existingIndex = await meili.getIndex(OCCURRENCES_INDEX).catch(() => null);
    if (existingIndex) {
      const task = await meili.deleteIndex(OCCURRENCES_INDEX);
      await meili.waitForTask(task.taskUid);
    }

    const createTask = await meili.createIndex(OCCURRENCES_INDEX, { primaryKey: "occurrence_id" });
    await meili.waitForTask(createTask.taskUid);

    const index = meili.index(OCCURRENCES_INDEX);
    const settingsTask = await index.updateSettings({
      filterableAttributes: [
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
      ],
      sortableAttributes: ["starts_at_utc", "starts_at_ts", "published_at", "published_at_ts"],
      pagination: { maxTotalHits: 50000 },
    });
    await meili.waitForTask(settingsTask.taskUid);

    const totalRes = await db.query<{ count: string }>("select count(*)::text as count from event_occurrences");
    const totalRows = Number(totalRes.rows[0]?.count ?? "0");

    let indexed = 0;
    for (let offset = 0; offset < totalRows; offset += batchSize) {
      const rows = await db.query<{
        occurrence_id: string;
        event_id: string;
        event_slug: string;
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
        country_code: string | null;
        city: string | null;
        geom: string | null;
        published_at: string | null;
        organizer_ids: string[];
        organizer_names: string[];
      }>(
        `
          select
            eo.id as occurrence_id,
            e.id as event_id,
            e.slug as event_slug,
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
          group by eo.id, e.id
          order by eo.id
          limit $1
          offset $2
        `,
        [batchSize, offset],
      );

      const docs = rows.rows.map((row) => {
        const geoMatch = row.geom?.match(/\(([-0-9.]+) ([-0-9.]+)\)/);
        const lng = geoMatch ? Number(geoMatch[1]) : null;
        const lat = geoMatch ? Number(geoMatch[2]) : null;

        return {
          occurrence_id: row.occurrence_id,
          event_id: row.event_id,
          event_slug: row.event_slug,
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
          tags: row.tags,
          languages: row.languages,
          organizer_ids: row.organizer_ids,
          organizer_names: row.organizer_names,
          country_code: row.country_code,
          city: row.city,
          has_geo: Boolean(lat !== null && lng !== null),
          geo: lat !== null && lng !== null ? { lat, lng } : null,
          published_at: row.published_at,
          published_at_ts: row.published_at ? Date.parse(row.published_at) : null,
        };
      });

      if (docs.length > 0) {
        const task = await index.addDocuments(docs);
        await meili.waitForTask(task.taskUid);
        indexed += docs.length;
      }
    }

    const stats = await index.getStats();

    console.log(JSON.stringify({
      mode: "hard_reset",
      db_total_occurrences: totalRows,
      indexed_docs: indexed,
      meili_total_docs: stats.numberOfDocuments,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
