/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
