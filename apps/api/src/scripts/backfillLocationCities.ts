import { Pool } from "pg";

import { config } from "../config";

/**
 * One-shot backfill: populate `locations.city` for rows where it was nulled
 * by the previous buggy `sanitizeCity` heuristic.
 *
 * Two passes:
 *   1. Exact mapping for the 17 location_ids called out in the original
 *      bug report (correct city known with certainty).
 *   2. First-comma-segment heuristic against `formatted_address` for the
 *      remaining `city IS NULL` rows, rejecting candidates that look like
 *      country names, UK postcodes, or are over 120 chars.
 *
 * Usage (inside the API container):
 *   node /app/apps/api/dist/scripts/backfillLocationCities.js              # dry-run
 *   node /app/apps/api/dist/scripts/backfillLocationCities.js --apply      # write
 */

const KNOWN_MAPPINGS: Array<{ id: string; city: string }> = [
  { id: "5259eadf-a33a-4772-a4f6-220141fd68e6", city: "Los Angeles" },
  { id: "587598f4-cea3-495b-9709-ee88543e5e66", city: "São Teotónio" },
  { id: "f5a5e133-c95b-4c03-a7a6-2a82e0997404", city: "Skalka U Doks" },
];

const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i;

// English country names that show up as the first comma-segment of
// `formatted_address` for malformed importer rows ("Czech Republic, Skalka U
// Doks, Czechia"). When the first segment matches one of these the row is
// punted to manual review rather than written incorrectly.
const COUNTRY_NAME_BLOCKLIST = new Set([
  "united states",
  "united kingdom",
  "czech republic",
  "czechia",
  "germany",
  "france",
  "spain",
  "portugal",
  "italy",
  "netherlands",
  "belgium",
  "thailand",
  "australia",
  "canada",
  "mexico",
  "brazil",
  "argentina",
  "india",
  "japan",
  "china",
]);

type Candidate = {
  id: string;
  oldCity: null;
  newCity: string;
  source: "known" | "first-segment";
  formattedAddress: string | null;
};

type Skipped = {
  id: string;
  formattedAddress: string | null;
  reason: string;
};

function pickCity(formattedAddress: string | null): { ok: true; city: string } | { ok: false; reason: string } {
  if (!formattedAddress) return { ok: false, reason: "no formatted_address" };
  const first = formattedAddress.split(",")[0]?.trim();
  if (!first) return { ok: false, reason: "empty first segment" };
  if (first.length > 120) return { ok: false, reason: "first segment >120 chars" };
  if (UK_POSTCODE_RE.test(first)) return { ok: false, reason: "first segment is UK postcode" };
  if (COUNTRY_NAME_BLOCKLIST.has(first.toLowerCase())) return { ok: false, reason: "first segment is country name" };
  return { ok: true, city: first };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];

  try {
    // Pass 1: known mappings
    for (const m of KNOWN_MAPPINGS) {
      const res = await pool.query<{ id: string; city: string | null; formatted_address: string | null }>(
        "select id, city, formatted_address from locations where id = $1",
        [m.id],
      );
      const row = res.rows[0];
      if (!row) {
        skipped.push({ id: m.id, formattedAddress: null, reason: "row not found" });
        continue;
      }
      if (row.city !== null) {
        skipped.push({ id: m.id, formattedAddress: row.formatted_address, reason: `already populated (${row.city})` });
        continue;
      }
      candidates.push({
        id: m.id,
        oldCity: null,
        newCity: m.city,
        source: "known",
        formattedAddress: row.formatted_address,
      });
    }

    // Pass 2: first-comma-segment heuristic
    const knownIds = new Set(KNOWN_MAPPINGS.map((m) => m.id));
    const res = await pool.query<{ id: string; formatted_address: string | null }>(
      "select id, formatted_address from locations where city is null and formatted_address is not null order by id",
    );
    for (const row of res.rows) {
      if (knownIds.has(row.id)) continue; // already in pass 1
      const pick = pickCity(row.formatted_address);
      if (!pick.ok) {
        skipped.push({ id: row.id, formattedAddress: row.formatted_address, reason: pick.reason });
        continue;
      }
      candidates.push({
        id: row.id,
        oldCity: null,
        newCity: pick.city,
        source: "first-segment",
        formattedAddress: row.formatted_address,
      });
    }

    console.log(`\n=== Backfill plan ===`);
    console.log(`Known mappings to apply: ${candidates.filter((c) => c.source === "known").length}`);
    console.log(`First-segment heuristic candidates: ${candidates.filter((c) => c.source === "first-segment").length}`);
    console.log(`Skipped: ${skipped.length}\n`);

    console.log(`--- Sample candidates (first 20) ---`);
    for (const c of candidates.slice(0, 20)) {
      console.log(`  [${c.source}] ${c.id}  "${c.newCity}"  <-  ${JSON.stringify(c.formattedAddress)}`);
    }
    if (candidates.length > 20) console.log(`  ... and ${candidates.length - 20} more`);

    console.log(`\n--- Sample skipped (first 20) ---`);
    for (const s of skipped.slice(0, 20)) {
      console.log(`  ${s.id}  reason="${s.reason}"  fmt=${JSON.stringify(s.formattedAddress)}`);
    }
    if (skipped.length > 20) console.log(`  ... and ${skipped.length - 20} more`);

    if (!apply) {
      console.log(`\nDry-run only. Re-run with --apply to write ${candidates.length} updates.\n`);
      return;
    }

    console.log(`\nApplying ${candidates.length} updates...`);
    const client = await pool.connect();
    let written = 0;
    try {
      await client.query("begin");
      for (const c of candidates) {
        const r = await client.query(
          "update locations set city = $1 where id = $2 and city is null",
          [c.newCity, c.id],
        );
        if (r.rowCount === 1) written++;
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    console.log(`Done. ${written} rows updated.`);
    console.log(`Next: trigger a Meilisearch reindex so the city facet picks up the new values:`);
    console.log(`  curl -X POST -H "Authorization: Bearer <admin>" https://events.danceresource.org/api/admin/events/reindex`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
