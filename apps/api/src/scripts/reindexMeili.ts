import { Pool } from "pg";

import { config } from "../config";
import { MeilisearchService } from "../services/meiliService";

const CONCURRENCY = 20;

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
    // Skip ensureIndex() — index already exists with correct settings.
    // Calling it triggers async settings rebuilds that block addDocuments.

    const result = await pool.query<{ id: string }>(
      `SELECT id FROM events WHERE status = 'published' ORDER BY created_at`,
    );

    const ids = result.rows.map((r) => r.id);
    const total = ids.length;
    // eslint-disable-next-line no-console
    console.log(`Reindexing ${total} published events (concurrency=${CONCURRENCY})...`);

    let done = 0;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((id) => meiliService.upsertOccurrencesForEvent(pool, id).catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`  Failed event ${id}:`, err);
        })),
      );
      done += batch.length;
      // eslint-disable-next-line no-console
      console.log(`  ${done}/${total}`);
    }

    // eslint-disable-next-line no-console
    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
