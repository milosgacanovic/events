import { getSiteBase, toUrlSetXml } from "../../lib/sitemap";

export const revalidate = 600;

export async function GET() {
  const siteBase = getSiteBase();
  const xml = toUrlSetXml([
    { loc: `${siteBase}/events` },
    { loc: `${siteBase}/organizers` },
  ]);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
