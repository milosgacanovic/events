import { getOrganizerSitemapItems, getSiteBase, toUrlSetXml } from "../../lib/sitemap";

export const revalidate = 600;

export async function GET() {
  const siteBase = getSiteBase();
  const items = await getOrganizerSitemapItems();
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
