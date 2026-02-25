import { Pool } from "pg";

import { config } from "../config";
import { refreshRecurringOccurrences } from "../services/eventLifecycleService";
import { MeilisearchService } from "../services/meiliService";

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const meiliService = new MeilisearchService(config.MEILI_URL, config.MEILI_MASTER_KEY);
    await meiliService.ensureIndex().catch(() => {});
    await refreshRecurringOccurrences(pool, meiliService);
    // eslint-disable-next-line no-console
    console.log("Recurring occurrences refreshed");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
