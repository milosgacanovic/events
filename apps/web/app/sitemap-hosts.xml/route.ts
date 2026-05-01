import { getOrganizerSitemapItems, getSiteBase, toUrlSetXml } from "../../lib/sitemap";

export const revalidate = 600;

export async function GET() {
  const siteBase = getSiteBase();
  let items;
  try {
    items = await getOrganizerSitemapItems();
  } catch {
    // Upstream API unreachable / returned no results. Return 503 so crawlers
    // retry and Cloudflare doesn't cache the failure.
    return new Response("Service Unavailable", { status: 503 });
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
