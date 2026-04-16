/** @type {import('next').NextConfig} */

// Keep the CSP string here so both the headers() hook below and a human
// reviewer can see exactly what's shipped. 'unsafe-inline' on script-src is
// required today by Next.js's inline runtime + inline JSON-LD blocks; a
// follow-up will move to nonces. Keycloak silent-check-sso is hosted on the
// same origin but the login iframe comes from sso.danceresource.org.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://sso.danceresource.org https://nominatim.openstreetmap.org",
  "frame-src 'self' https://sso.danceresource.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://sso.danceresource.org",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
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
