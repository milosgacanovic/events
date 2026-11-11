/**
 * Seed the city landing pages (SEO round 3, Proposal B).
 *
 *   tsx src/scripts/seedCities.ts [--csv=/path/review.csv]            dry run (default)
 *   tsx src/scripts/seedCities.ts --apply --csv=/path/review.csv      write approved rows
 *
 * Dry run: groups upcoming in-person/hybrid events by normalized city
 * (case, diacritics, exonyms, merged districts), prints counts and 10 sample
 * before/after rows, and writes a review CSV. The owner edits the CSV
 * (`approve` yes/no, `display_name`) and the --apply run inserts the approved
 * rows into `cities` plus every spelling into `city_aliases`. Nothing else
 * is written. Rule for a suggested "yes": >= 5 distinct upcoming series and
 * >= 2 hosts, and the value looks like a city.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { Pool } from "pg";

import { config } from "../config";
import { listUpcomingCityPairs } from "../db/cityRepo";
import { CITY_DISPLAY_NAMES, CITY_EXONYMS, cityKey } from "../utils/cityKey";
import { toSlugPart } from "../utils/eventSlug";

const MIN_SERIES = 5;
const MIN_HOSTS = 2;

// Regions, codes and other values that aren't a city (design note, Q20).
const NOT_A_CITY = new Set([
  "noord brabant", "colorado", "central europe", "la gomera", "ardeche", "dxb", "bham", "and meditation",
  "online", "worldwide", "various", "tba", "tbd",
  "south east", "south west", "north east", "north west", "southeast", "southwest", "guipuzcoa", "gipuzkoa",
]);

type Group = {
  country: string;
  slug: string;
  series: Set<string>;
  hosts: Set<string>;
  occurrences: number;
  spellings: Map<string, number>;
  keys: Set<string>;
};

function titleCase(value: string): string {
  return value.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function displayNameFor(group: Group): string {
  const fixed = CITY_DISPLAY_NAMES[group.country]?.[group.slug];
  if (fixed) return fixed;
  const exonymTarget = Object.values(CITY_EXONYMS[group.country] ?? {}).includes(group.slug);
  const top = Array.from(group.spellings.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? group.slug;
  if (exonymTarget && cityKey(top).replace(/ /g, "-") !== group.slug) return titleCase(group.slug.replace(/-/g, " "));
  // ALL-CAPS or all-lowercase spellings ("BOLOGNA", "paris") → Title Case.
  if (top === top.toUpperCase() || top === top.toLowerCase()) return titleCase(top.normalize("NFC"));
  return top.normalize("NFC");
}

function junkReason(group: Group): string | null {
  for (const key of group.keys) {
    if (NOT_A_CITY.has(key)) return "not a city (region/code)";
  }
  const top = Array.from(group.spellings.keys())[0] ?? "";
  if (/\d/.test(top)) return "address or code, not a city";
  if (cityKey(top).split(" ").length > 4) return "too long for a city name";
  return null;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function buildGroups(pool: Pool): Promise<{ groups: Group[]; pairs: number }> {
  const pairs = await listUpcomingCityPairs(pool);
  const dbAliases = await pool.query<{ country_code: string; alias_key: string; city_slug: string }>(
    `select country_code, alias_key, city_slug from city_aliases`,
  ).catch(() => ({ rows: [] as Array<{ country_code: string; alias_key: string; city_slug: string }> }));
  const aliasMap = new Map(dbAliases.rows.map((r) => [`${r.country_code}/${r.alias_key}`, r.city_slug]));

  const groups = new Map<string, Group>();
  for (const pair of pairs) {
    const country = pair.country_code.toLowerCase();
    const key = cityKey(pair.city);
    if (!key || !/^[a-z]{2}$/.test(country)) continue;
    const slug = aliasMap.get(`${country}/${key}`) ?? CITY_EXONYMS[country]?.[key] ?? (await toSlugPart(key));
    if (!slug) continue;
    const id = `${country}/${slug}`;
    const g = groups.get(id) ?? { country, slug, series: new Set(), hosts: new Set(), occurrences: 0, spellings: new Map(), keys: new Set() };
    pair.series_keys.forEach((s) => g.series.add(s));
    pair.organizer_ids.forEach((o) => g.hosts.add(o));
    g.occurrences += pair.occurrence_count;
    g.spellings.set(pair.city, (g.spellings.get(pair.city) ?? 0) + pair.occurrence_count);
    g.keys.add(key);
    groups.set(id, g);
  }
  // Spellings sorted by frequency so the CSV shows the dominant one first.
  for (const g of groups.values()) {
    g.spellings = new Map(Array.from(g.spellings.entries()).sort((a, b) => b[1] - a[1]));
  }
  return { groups: Array.from(groups.values()), pairs: pairs.length };
}

async function dryRun(pool: Pool, csvPath: string | null) {
  const { groups, pairs } = await buildGroups(pool);
  const withSeries = groups.filter((g) => g.series.size >= MIN_SERIES);
  const candidates = withSeries
    .map((g) => {
      const junk = junkReason(g);
      const enoughHosts = g.hosts.size >= MIN_HOSTS;
      return {
        g,
        approve: !junk && enoughHosts ? "yes" : "no",
        note: junk ?? (enoughHosts ? "" : "single host (would duplicate the host page)"),
      };
    })
    .sort((a, b) => b.g.series.size - a.g.series.size || a.g.slug.localeCompare(b.g.slug));
  const merged = groups.filter((g) => g.spellings.size > 1);

  console.log("Mode: DRY-RUN (nothing written)");
  console.log(`Raw (country, city) pairs with upcoming in-person/hybrid events: ${pairs}`);
  console.log(`Cities after normalization: ${groups.length} (${merged.length} merge 2+ spellings)`);
  console.log(`Cities with >= ${MIN_SERIES} distinct upcoming series: ${withSeries.length}`);
  console.log(`  suggested yes (>= ${MIN_HOSTS} hosts, looks like a city): ${candidates.filter((c) => c.approve === "yes").length}`);
  console.log(`  suggested no: ${candidates.filter((c) => c.approve === "no").length}`);
  console.log("");
  console.log("Samples (raw spellings → page):");
  const samples = [
    ...candidates.filter((c) => c.g.spellings.size > 1).slice(0, 6),
    ...candidates.filter((c) => c.g.spellings.size === 1).slice(0, 2),
    ...candidates.filter((c) => c.approve === "no").slice(0, 2),
  ].slice(0, 10);
  for (const c of samples) {
    const spellings = Array.from(c.g.spellings.keys()).map((s) => JSON.stringify(s)).join(", ");
    console.log(`  ${spellings}`);
    console.log(`    → /events/in/${c.g.country}/${c.g.slug}  "${displayNameFor(c.g)}"  series=${c.g.series.size} hosts=${c.g.hosts.size}  approve=${c.approve}${c.note ? ` (${c.note})` : ""}`);
  }
  if (csvPath) {
    const header = "approve,country,slug,display_name,series,hosts,occurrences,spellings,note";
    const lines = candidates.map((c) => [
      c.approve, c.g.country, c.g.slug, displayNameFor(c.g), c.g.series.size, c.g.hosts.size, c.g.occurrences,
      Array.from(c.g.spellings.keys()).join(" | "), c.note,
    ].map(csvEscape).join(","));
    writeFileSync(csvPath, [header, ...lines].join("\n") + "\n");
    console.log("");
    console.log(`Review CSV: ${csvPath} (${candidates.length} rows). Edit approve/display_name, then --apply --csv=…`);
  }
}

async function apply(pool: Pool, csvPath: string) {
  const rows = parseCsv(readFileSync(csvPath, "utf8")).filter((r) => r.approve?.toLowerCase() === "yes");
  const { groups } = await buildGroups(pool);
  const bySlug = new Map(groups.map((g) => [`${g.country}/${g.slug}`, g]));
  const client = await pool.connect();
  let cities = 0;
  let aliases = 0;
  try {
    await client.query("begin");
    for (const row of rows) {
      const country = row.country.toLowerCase();
      const slug = row.slug;
      if (!/^[a-z]{2}$/.test(country) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`bad row: ${JSON.stringify(row)}`);
      }
      const res = await client.query(
        `insert into cities (country_code, slug, display_name, approved) values ($1, $2, $3, true)
          on conflict (country_code, slug) do update set display_name = excluded.display_name, approved = true, updated_at = now()`,
        [country, slug, row.display_name || slug],
      );
      cities += res.rowCount ?? 0;
      const keys = new Set<string>(bySlug.get(`${country}/${slug}`)?.keys ?? []);
      for (const [alias, target] of Object.entries(CITY_EXONYMS[country] ?? {})) if (target === slug) keys.add(alias);
      for (const key of keys) {
        const a = await client.query(
          `insert into city_aliases (country_code, alias_key, city_slug) values ($1, $2, $3)
            on conflict (country_code, alias_key) do update set city_slug = excluded.city_slug`,
          [country, key, slug],
        );
        aliases += a.rowCount ?? 0;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  console.log(`Applied: ${cities} cities approved, ${aliases} spellings mapped (from ${rows.length} approved CSV rows).`);
}

async function main() {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => a.startsWith("--csv="))?.slice("--csv=".length) ?? null;
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    if (args.includes("--apply")) {
      if (!csvArg) throw new Error("--apply needs --csv=<reviewed file>");
      await apply(pool, csvArg);
    } else {
      await dryRun(pool, csvArg);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
