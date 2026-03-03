import type { MetadataRoute } from "next";

const siteBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://beta.events.danceresource.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/events", "/hosts"],
        disallow: ["/admin", "/events?*", "/hosts?*"],
      },
    ],
    sitemap: `${siteBase}/sitemap.xml`,
  };
}
