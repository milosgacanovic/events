/**
 * Initial hub slugs for recurring series (SEO round 3, Proposal A1).
 *
 *   tsx src/scripts/backfillSeriesSlugs.ts [--csv=/path/plan.csv]   dry run (default)
 *   tsx src/scripts/backfillSeriesSlugs.ts --apply                   write series_slugs
 *
 * Qualifying series: multi-sibling, public, >= 2 upcoming dates. Slugs come
 * from the Task 7 generator (title + city, then + surname, number last); a
 * dead re-keyed twin (same title + first host + city) hands over its slug.
 * After the first --apply, the nightly occurrences refresh assigns slugs to
 * newly qualifying series the same way.
 */
import { writeFileSync } from "node:fs";

import { Pool } from "pg";

import { config } from "../config";
import { applySeriesSlugPlans, planSeriesSlugs } from "../db/seriesHubRepo";

function csvEscape(value: string | number | null): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => a.startsWith("--csv="))?.slice("--csv=".length) ?? null;
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    const { plans, candidates, existing } = await planSeriesSlugs(pool);
    const numeric = plans.filter((p) => /-\d+$/.test(p.slug)).length;
    console.log(`Mode: ${args.includes("--apply") ? "APPLY" : "DRY-RUN (nothing written)"}`);
    console.log(`Qualifying series (multi-sibling, public, >= 2 upcoming): ${candidates}`);
    console.log(`  already have a hub slug: ${existing}`);
    console.log(`  new slugs: ${plans.filter((p) => p.kind === "new").length} (ending in a number: ${numeric})`);
    console.log(`  slugs moved from a dead re-keyed twin: ${plans.filter((p) => p.kind === "moved").length}`);
    console.log("");
    console.log("Samples (series → hub URL):");
    const samples = [
      ...plans.filter((p) => p.kind === "moved").slice(0, 2),
      ...plans.filter((p) => /-\d+$/.test(p.slug)).slice(0, 2),
      ...plans.filter((p) => p.kind === "new" && !/-\d+$/.test(p.slug)).slice(0, 10),
    ].slice(0, 10);
    for (const p of samples) {
      console.log(`  "${p.title}" · ${p.city ?? "—"} · ${p.organizer ?? "—"}`);
      console.log(`    → /series/${p.slug}${p.kind === "moved" ? " (moved from a re-keyed series)" : ""}`);
    }
    if (csvPath) {
      const lines = plans.map((p) => [p.slug, p.kind, p.title, p.city, p.organizer, p.seriesId].map(csvEscape).join(","));
      writeFileSync(csvPath, ["slug,kind,title,city,first_host,series_id", ...lines].join("\n") + "\n");
      console.log("");
      console.log(`Full plan: ${csvPath} (${plans.length} rows)`);
    }
    if (args.includes("--apply")) {
      const result = await applySeriesSlugPlans(pool, plans);
      console.log("");
      console.log(`Applied: ${result.inserted} inserted, ${result.moved} moved.`);
    } else {
      console.log("");
      console.log("Dry run — nothing written. Re-run with --apply to create the hub slugs.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
