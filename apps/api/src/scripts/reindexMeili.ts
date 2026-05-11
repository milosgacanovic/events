import { MeiliSearch } from "meilisearch";
import { Pool } from "pg";

import { config } from "../config";
import { MeilisearchService, OCCURRENCES_INDEX, SERIES_INDEX } from "../services/meiliService";

const BATCH_SIZE = 500;

/**
 * No-disruption reindex via atomic index swap.
 *
 * The previous version did `deleteAllDocuments` → re-add on the live indexes,
 * which exposed a partial-state window of 1–3 minutes where search queries
 * returned a growing count (e.g. 144 → 1743 → 2627 as batches landed).
 *
 * Now: build the new docs into shadow indexes (`*_shadow`), apply identical
 * settings, then call Meili's atomic `swapIndexes`. Queries hit the fully
 * populated live index right up to the swap; after the swap they hit the
 * fully populated new index. Zero partial-state visibility.
 *
 * After the swap the shadow UIDs hold the now-stale old data — delete them
 * to reclaim disk.
 */
const OCCURRENCES_SHADOW = `${OCCURRENCES_INDEX}_shadow`;
const SERIES_SHADOW = `${SERIES_INDEX}_shadow`;

async function deleteIndexIfExists(client: MeiliSearch, uid: string): Promise<void> {
  try {
    const task = await client.deleteIndex(uid);
    await client.waitForTask(task.taskUid, { timeOutMs: 60000 });
  } catch {
    // index didn't exist — nothing to do
  }
}

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
    const client = new MeiliSearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });

    // Clear any stale shadow indexes from a previous interrupted run.
    // eslint-disable-next-line no-console
    console.log("Cleaning up any leftover shadow indexes...");
    await deleteIndexIfExists(client, OCCURRENCES_SHADOW);
    await deleteIndexIfExists(client, SERIES_SHADOW);

    // --- Build occurrence shadow index -------------------------------------
    // eslint-disable-next-line no-console
    console.log(`Building shadow index ${OCCURRENCES_SHADOW}...`);
    await meiliService.applyOccurrenceIndexSettings(OCCURRENCES_SHADOW);
    const occShadow = client.index(OCCURRENCES_SHADOW);

    // eslint-disable-next-line no-console
    console.log("Fetching all occurrence docs from DB...");
    const occDocs = await meiliService.fetchOccurrenceDocs(pool);
    // eslint-disable-next-line no-console
    console.log(`Fetched ${occDocs.length} occurrence docs.`);

    let occAdded = 0;
    let lastOccTaskUid: number | null = null;
    for (let i = 0; i < occDocs.length; i += BATCH_SIZE) {
      const batch = occDocs.slice(i, i + BATCH_SIZE);
      const task = await occShadow.addDocuments(batch);
      lastOccTaskUid = task.taskUid;
      occAdded += batch.length;
      // eslint-disable-next-line no-console
      console.log(`  occurrences ${occAdded}/${occDocs.length}`);
    }
    if (lastOccTaskUid !== null) {
      // eslint-disable-next-line no-console
      console.log("Waiting for occurrence shadow indexing to settle...");
      await client.waitForTask(lastOccTaskUid, { timeOutMs: 600000 });
    }

    // --- Build series shadow index -----------------------------------------
    // eslint-disable-next-line no-console
    console.log(`Building shadow index ${SERIES_SHADOW}...`);
    await meiliService.applySeriesIndexSettings(SERIES_SHADOW);
    const seriesShadow = client.index(SERIES_SHADOW);

    let seriesOffset = 0;
    let seriesAdded = 0;
    let lastSeriesTaskUid: number | null = null;
    while (true) {
      const batch = await meiliService.fetchSeriesDocs(pool, BATCH_SIZE, seriesOffset);
      if (batch.length === 0) break;
      const task = await seriesShadow.addDocuments(batch);
      lastSeriesTaskUid = task.taskUid;
      seriesAdded += batch.length;
      seriesOffset += BATCH_SIZE;
      // eslint-disable-next-line no-console
      console.log(`  series ${seriesAdded}`);
    }
    if (lastSeriesTaskUid !== null) {
      // eslint-disable-next-line no-console
      console.log("Waiting for series shadow indexing to settle...");
      await client.waitForTask(lastSeriesTaskUid, { timeOutMs: 600000 });
    }

    // --- Atomic swap -------------------------------------------------------
    // Bundles both swaps into a single Meili task; either both flip together
    // or (on rare failure) neither does.
    // eslint-disable-next-line no-console
    console.log("Swapping shadow indexes into live...");
    const swapTask = await client.swapIndexes([
      { indexes: [OCCURRENCES_INDEX, OCCURRENCES_SHADOW] },
      { indexes: [SERIES_INDEX, SERIES_SHADOW] },
    ]);
    await client.waitForTask(swapTask.taskUid, { timeOutMs: 60000 });

    // --- Cleanup -----------------------------------------------------------
    // Shadow UIDs now hold the old data — drop them.
    // eslint-disable-next-line no-console
    console.log("Dropping old (now-shadow-named) indexes...");
    await deleteIndexIfExists(client, OCCURRENCES_SHADOW);
    await deleteIndexIfExists(client, SERIES_SHADOW);

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
