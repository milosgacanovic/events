import { EVENT_SITEMAP_CHUNK_SIZE, getEventSitemapItems, getSiteBase, toSitemapIndexXml } from "../../lib/sitemap";

// Rendered per request, not prerendered at build: the build runs against the
// currently-live API, which may not have /seo/sitemap/events yet. Data is
// still cached for 10 min by unstable_cache in lib/sitemap.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const siteBase = getSiteBase();
  let items;
  try {
    items = await getEventSitemapItems();
  } catch {
    // Upstream API unreachable. 503 so crawlers retry and nothing caches it.
    return new Response("Service Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const chunkCount = Math.max(Math.ceil(items.length / EVENT_SITEMAP_CHUNK_SIZE), 1);
  const locations = [
    `${siteBase}/sitemap-pages.xml`,
    `${siteBase}/sitemap-hosts.xml`,
    `${siteBase}/sitemap-cities.xml`,
    `${siteBase}/sitemap-series.xml`,
  ];

  for (let page = 1; page <= chunkCount; page += 1) {
    locations.push(`${siteBase}/sitemap-events-${page}.xml`);
  }

  return new Response(toSitemapIndexXml(locations), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
