import { MeiliSearch } from "meilisearch";
import { Pool } from "pg";

import { config } from "../config";
import { MeilisearchService, OCCURRENCES_INDEX } from "../services/meiliService";

const BATCH_SIZE = 500;

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
    const client = new MeiliSearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });
    const index = client.index(OCCURRENCES_INDEX);

    // Step 1: Delete all documents at once and wait for completion
    // eslint-disable-next-line no-console
    console.log("Deleting all existing documents...");
    const deleteTask = await index.deleteAllDocuments();
    await client.waitForTask(deleteTask.taskUid, { timeOutMs: 120000 });
    // eslint-disable-next-line no-console
    console.log("Deleted.");

    // Step 2: Fetch all occurrence docs from DB in one query
    // eslint-disable-next-line no-console
    console.log("Fetching all occurrence docs from DB...");
    const docs = await meiliService.fetchOccurrenceDocs(pool);
    // eslint-disable-next-line no-console
    console.log(`Fetched ${docs.length} occurrence docs.`);

    // Step 3: Add in batches of BATCH_SIZE
    let added = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      await index.addDocuments(batch);
      added += batch.length;
      // eslint-disable-next-line no-console
      console.log(`  ${added}/${docs.length}`);
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
