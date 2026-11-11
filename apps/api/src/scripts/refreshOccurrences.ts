import { Pool } from "pg";

import { config } from "../config";
import { refreshCityQualification, syncCityAliases } from "../db/cityRepo";
import { assignNewSeriesSlugs } from "../db/seriesHubRepo";
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
    // SEO round 3 upkeep (city pages B, series hubs A1). Both are no-ops
    // until the owner-reviewed seed/backfill has been applied.
    const aliases = await syncCityAliases(pool);
    const cities = await refreshCityQualification(pool);
    const hubs = await assignNewSeriesSlugs(pool);
    // eslint-disable-next-line no-console
    console.log(`City aliases added: ${aliases}; city grace started/cleared: ${cities.started}/${cities.cleared}; hub slugs inserted/moved: ${hubs.inserted}/${hubs.moved}${hubs.skipped ? ` (${hubs.skipped})` : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
