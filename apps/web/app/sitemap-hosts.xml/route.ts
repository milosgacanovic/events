import { getOrganizerSitemapItems, getSiteBase, toUrlSetXml } from "../../lib/sitemap";

// Rendered per request, not prerendered at build: the build runs against the
// currently-live API, which may not have /seo/sitemap/hosts yet. Data is
// still cached for 10 min by unstable_cache in lib/sitemap.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const siteBase = getSiteBase();
  let items;
  try {
    items = await getOrganizerSitemapItems();
  } catch {
    // Upstream API unreachable / returned no results. Return 503 so crawlers
    // retry and Cloudflare doesn't cache the failure.
    return new Response("Service Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const xml = toUrlSetXml(
    items.map((item) => ({
      loc: `${siteBase}/hosts/${item.slug}`,
      lastmod: item.lastmod,
    })),
  );
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
