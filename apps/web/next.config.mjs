/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(events|hosts)(.*)",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=600" }],
      },
      {
        source: "/(admin|profile|auth)(.*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/sitemap-events-:page(\\d+).xml",
        destination: "/sitemap-events/:page",
      },
    ];
  },
};

export default nextConfig;
