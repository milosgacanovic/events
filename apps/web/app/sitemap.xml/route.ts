import { EVENT_SITEMAP_CHUNK_SIZE, getEventSitemapItems, getSiteBase, toSitemapIndexXml } from "../../lib/sitemap";

export const revalidate = 600;

export async function GET() {
  const siteBase = getSiteBase();
  const items = await getEventSitemapItems();
  const chunkCount = Math.max(Math.ceil(items.length / EVENT_SITEMAP_CHUNK_SIZE), 1);
  const locations = [`${siteBase}/sitemap-pages.xml`];

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
