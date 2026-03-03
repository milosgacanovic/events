import {
  EVENT_SITEMAP_CHUNK_SIZE,
  getEventSitemapItems,
  getSiteBase,
  toUrlSetXml,
} from "../../../lib/sitemap";

export const revalidate = 600;

export async function GET(
  _request: Request,
  context: { params: { page: string } },
) {
  const pageNumber = Number(context.params.page);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  const items = await getEventSitemapItems();
  const start = (pageNumber - 1) * EVENT_SITEMAP_CHUNK_SIZE;
  const end = start + EVENT_SITEMAP_CHUNK_SIZE;
  const chunk = items.slice(start, end);

  if (chunk.length === 0 && pageNumber !== 1) {
    return new Response("Not Found", { status: 404 });
  }

  const siteBase = getSiteBase();
  const xml = toUrlSetXml(
    chunk.map((item) => ({
      loc: `${siteBase}/events/${item.slug}`,
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
