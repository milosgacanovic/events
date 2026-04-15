import { MeiliSearch } from "meilisearch";
import { Pool } from "pg";

import { config } from "../config";
import { MeilisearchService, OCCURRENCES_INDEX, SERIES_INDEX } from "../services/meiliService";

const BATCH_SIZE = 500;

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
    const client = new MeiliSearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });

    // --- Occurrence index (map, alerts, calendar) --------------------------
    const occIndex = client.index(OCCURRENCES_INDEX);
    // eslint-disable-next-line no-console
    console.log("Deleting all existing occurrence documents...");
    const occDeleteTask = await occIndex.deleteAllDocuments();
    await client.waitForTask(occDeleteTask.taskUid, { timeOutMs: 120000 });
    // eslint-disable-next-line no-console
    console.log("Deleted.");

    // eslint-disable-next-line no-console
    console.log("Fetching all occurrence docs from DB...");
    const occDocs = await meiliService.fetchOccurrenceDocs(pool);
    // eslint-disable-next-line no-console
    console.log(`Fetched ${occDocs.length} occurrence docs.`);

    let occAdded = 0;
    for (let i = 0; i < occDocs.length; i += BATCH_SIZE) {
      const batch = occDocs.slice(i, i + BATCH_SIZE);
      await occIndex.addDocuments(batch);
      occAdded += batch.length;
      // eslint-disable-next-line no-console
      console.log(`  occurrences ${occAdded}/${occDocs.length}`);
    }

    // --- Series index (search list) ----------------------------------------
    const seriesIndex = client.index(SERIES_INDEX);
    // eslint-disable-next-line no-console
    console.log("Deleting all existing series documents...");
    const seriesDeleteTask = await seriesIndex.deleteAllDocuments();
    await client.waitForTask(seriesDeleteTask.taskUid, { timeOutMs: 120000 });
    // eslint-disable-next-line no-console
    console.log("Deleted.");

    let seriesOffset = 0;
    let seriesAdded = 0;
    while (true) {
      const batch = await meiliService.fetchSeriesDocs(pool, BATCH_SIZE, seriesOffset);
      if (batch.length === 0) break;
      await seriesIndex.addDocuments(batch);
      seriesAdded += batch.length;
      seriesOffset += BATCH_SIZE;
      // eslint-disable-next-line no-console
      console.log(`  series ${seriesAdded}`);
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
