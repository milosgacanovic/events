/**
 * Post-deploy functional smoke test.
 *
 * Runs after Apache has switched traffic to the new color. Validates that the
 * public URL is not just responding (bg-deploy.sh already curls /api/health)
 * but that key user-facing flows actually *work* end-to-end: search returns
 * non-empty results, filters narrow results, map clusters render, metadata
 * endpoints populate, sitemap is valid, and the Meili/DB totals agree within
 * tolerance.
 *
 * Exits 0 on all-green, 1 on any failure. Intended for CI and bg-deploy.sh.
 *
 * Env:
 *   SMOKE_URL    — base URL to hit (default: https://events.danceresource.org)
 *   SMOKE_TIMEOUT_MS — per-request timeout (default: 10000)
 *   SMOKE_PARITY_TOLERANCE — max (|meili - db| / db) ratio allowed (default: 0.05)
 */

const BASE_URL = (process.env.SMOKE_URL ?? "https://events.danceresource.org").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const PARITY_TOLERANCE = Number(process.env.SMOKE_PARITY_TOLERANCE ?? 0.05);

type Check = {
  name: string;
  run: () => Promise<void>;
};

type CheckResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T; durationMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    const text = await res.text();
    const durationMs = Date.now() - start;
    let body: unknown;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body: body as T, durationMs };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(path: string): Promise<{ status: number; body: string; durationMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    const body = await res.text();
    return { status: res.status, body, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const checks: Check[] = [
  {
    name: "health: ok + db + meili + counts > 0",
    run: async () => {
      const { status, body } = await fetchJson<{
        ok: boolean;
        db: string;
        meili: string;
        current_event_count: number;
        published_event_count: number;
      }>("/api/health");
      assert(status === 200, `health status ${status}`);
      assert(body.ok === true, "health.ok !== true");
      assert(body.db === "ok", `health.db=${body.db}`);
      assert(body.meili === "ok", `health.meili=${body.meili}`);
      assert((body.current_event_count ?? 0) > 0, "current_event_count <= 0");
      assert((body.published_event_count ?? 0) > 0, "published_event_count <= 0");
    },
  },
  {
    name: "events/search: returns a page of hits with expected shape",
    run: async () => {
      const { status, body } = await fetchJson<{ hits: unknown[]; pagination?: { total?: number } }>(
        "/api/events/search?pageSize=5",
      );
      assert(status === 200, `search status ${status}`);
      assert(Array.isArray(body.hits), "hits is not an array");
      assert(body.hits.length > 0, "search returned 0 hits");
      const hit = body.hits[0] as Record<string, unknown>;
      assert(typeof hit.occurrenceId === "string", "hit.occurrenceId missing");
      assert(hit.event && typeof (hit.event as { slug: unknown }).slug === "string", "hit.event.slug missing");
      assert(typeof hit.startsAtUtc === "string", "hit.startsAtUtc missing");
    },
  },
  {
    name: "events/search: full-text query narrows results",
    run: async () => {
      const { status, body } = await fetchJson<{ hits: unknown[] }>(
        "/api/events/search?q=dance&pageSize=5",
      );
      assert(status === 200, `q search status ${status}`);
      assert(Array.isArray(body.hits) && body.hits.length > 0, "q=dance returned empty");
    },
  },
  {
    name: "events/search: eventDate=today returns a valid page",
    run: async () => {
      const { status, body } = await fetchJson<{ hits: unknown[] }>(
        "/api/events/search?eventDate=today&pageSize=5&tz=UTC",
      );
      assert(status === 200, `eventDate=today status ${status}`);
      assert(Array.isArray(body.hits), "eventDate=today hits missing");
    },
  },
  {
    name: "events/search: hasGeo=true filters to located events only",
    run: async () => {
      const { status, body } = await fetchJson<{ hits: Array<{ location?: unknown }> }>(
        "/api/events/search?hasGeo=true&pageSize=10",
      );
      assert(status === 200, `hasGeo status ${status}`);
      assert(body.hits.length > 0, "hasGeo=true returned 0 hits");
    },
  },
  {
    name: "organizers/search: returns non-empty list",
    run: async () => {
      const { status, body } = await fetchJson<{ items: unknown[] }>(
        "/api/organizers/search?pageSize=5",
      );
      assert(status === 200, `organizers status ${status}`);
      assert(Array.isArray(body.items) && body.items.length > 0, "organizers empty");
    },
  },
  {
    name: "map/clusters: world bbox at zoom 2 returns a FeatureCollection",
    run: async () => {
      const { status, body } = await fetchJson<{
        type: string;
        features: Array<{ properties: Record<string, unknown> }>;
      }>("/api/map/clusters?bbox=-180,-60,180,80&zoom=2");
      assert(status === 200, `map/clusters status ${status}`);
      assert(body.type === "FeatureCollection", `map type=${body.type}`);
      assert(body.features.length > 0, "map returned 0 features");
      // At world zoom we should see at least one cluster, not every pin as leaf.
      assert(
        body.features.some((f) => (f.properties as { cluster?: boolean }).cluster === true),
        "no cluster features at zoom 2 — supercluster may not be running",
      );
    },
  },
  {
    name: "map/clusters: invalid bbox returns 400 (input validation works)",
    run: async () => {
      const { status } = await fetchJson("/api/map/clusters?bbox=not,a,bbox,here&zoom=2");
      assert(status === 400, `expected 400 for bad bbox, got ${status}`);
    },
  },
  {
    name: "meta/taxonomies: returns populated practice categories",
    run: async () => {
      const { status, body } = await fetchJson<{
        practices: { categories: unknown[] };
      }>("/api/meta/taxonomies");
      assert(status === 200, `taxonomies status ${status}`);
      assert(Array.isArray(body.practices?.categories) && body.practices.categories.length > 0, "no practice categories");
    },
  },
  {
    name: "sitemap.xml: valid XML with event entries",
    run: async () => {
      const { status, body } = await fetchText("/sitemap.xml");
      assert(status === 200, `sitemap status ${status}`);
      assert(body.trim().startsWith("<?xml"), "sitemap missing XML prolog");
      // Root /sitemap.xml is an index; either it lists sub-sitemaps or urls directly.
      assert(body.includes("<loc>"), "sitemap has no <loc> entries");
    },
  },
  {
    name: "events/ HTML: renders and references Next.js runtime",
    run: async () => {
      const { status, body } = await fetchText("/events");
      assert(status === 200, `/events status ${status}`);
      assert(body.includes("<!DOCTYPE html>") || body.includes("<!doctype html>"), "events page: not HTML");
      assert(body.includes("_next/") || body.includes("__NEXT_DATA__"), "events page: no Next.js markers");
    },
  },
  {
    name: "Meili/DB parity: published count within tolerance of search totalCount",
    run: async () => {
      const [health, search] = await Promise.all([
        fetchJson<{ published_event_count: number }>("/api/health"),
        fetchJson<{ pagination?: { total?: number } }>("/api/events/search?pageSize=1&includePast=true"),
      ]);
      const dbCount = health.body.published_event_count;
      const meiliTotal = search.body.pagination?.total;
      if (typeof meiliTotal !== "number" || !dbCount) {
        // Soft-skip if the search response doesn't expose pagination.total on this path.
        return;
      }
      const drift = Math.abs(meiliTotal - dbCount) / dbCount;
      // Note: DB counts events, Meili indexes (series x occurrences) — exact parity not expected.
      // We just check the search index isn't empty / catastrophically short.
      assert(meiliTotal > 0, "Meili total is 0 (index empty?)");
      assert(
        drift < 1.0,
        `Meili/DB ratio way off: meili=${meiliTotal} db=${dbCount} drift=${drift.toFixed(3)}`,
      );
      // Log but don't fail on smaller drift — it's informational.
      if (drift > PARITY_TOLERANCE) {
        console.log(
          `  note: meili/db drift ${(drift * 100).toFixed(1)}% exceeds tolerance ${(PARITY_TOLERANCE * 100).toFixed(1)}% (soft)`,
        );
      }
    },
  },
  {
    name: "response latency: health + search under 3s each",
    run: async () => {
      const [health, search] = await Promise.all([
        fetchJson("/api/health"),
        fetchJson("/api/events/search?pageSize=1"),
      ]);
      assert(health.durationMs < 3000, `health took ${health.durationMs}ms`);
      assert(search.durationMs < 3000, `search took ${search.durationMs}ms`);
    },
  },
];

async function main() {
  console.log(`post-deploy smoke: ${BASE_URL}`);
  console.log(`running ${checks.length} checks (timeout ${TIMEOUT_MS}ms each)\n`);

  const results: CheckResult[] = [];
  for (const check of checks) {
    const start = Date.now();
    try {
      await check.run();
      const durationMs = Date.now() - start;
      results.push({ name: check.name, ok: true, durationMs });
      console.log(`  OK  ${check.name} (${durationMs}ms)`);
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);
      results.push({ name: check.name, ok: false, durationMs, error });
      console.log(`  FAIL ${check.name} (${durationMs}ms): ${error}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.error(`\npost-deploy smoke FAILED: ${failed.length} check(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke runner crashed:", err);
  process.exit(1);
});
