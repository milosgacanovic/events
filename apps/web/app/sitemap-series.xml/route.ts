import { getSeriesSitemapItems, getSiteBase, toUrlSetXml } from "../../lib/sitemap";

// Rendered per request (the build talks to the currently-live API); data is
// cached for 10 min by unstable_cache in lib/sitemap.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const siteBase = getSiteBase();
  let items;
  try {
    items = await getSeriesSitemapItems();
  } catch {
    return new Response("Service Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const xml = toUrlSetXml(items.map((item) => ({ loc: `${siteBase}/series/${item.slug}`, lastmod: item.lastmod })));
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
