import { Client } from "pg";

import { inferCountryCode } from "../apps/api/src/utils/countryCode";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://dr_events:dr_events_password@localhost:15432/dr_events";

async function main() {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  try {
    const rows = await db.query<{ id: string; country_code: string | null; formatted_address: string | null }>(
      `
        select id, country_code, formatted_address
        from locations
      `,
    );

    let updatedLocations = 0;

    for (const row of rows.rows) {
      const inferred = inferCountryCode(row.country_code, row.formatted_address);
      if (!inferred || inferred === row.country_code) {
        continue;
      }

      await db.query(`update locations set country_code = $2 where id = $1`, [row.id, inferred]);
      updatedLocations += 1;
    }

    const occurrenceUpdate = await db.query(
      `
        update event_occurrences eo
        set country_code = l.country_code,
            updated_at = now()
        from locations l
        where eo.location_id = l.id
          and l.country_code is not null
          and (eo.country_code is distinct from l.country_code)
      `,
    );

    console.log(
      JSON.stringify(
        {
          backfill_location_country_codes: {
            locations_scanned: rows.rowCount,
            locations_updated: updatedLocations,
            occurrences_updated: occurrenceUpdate.rowCount,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
