import type { NextConfig } from "next";

/*
 * Security headers — May 2026 best practices.
 *
 * CSP is intentionally permissive on this static marketing site: it allows
 * `'unsafe-inline'` for inline JSON-LD scripts (used by every page for SEO
 * structured data) and inline styles (Tailwind v4 occasionally inlines
 * critical CSS at build time). For a backend API or auth-aware app you'd
 * want a hash- or nonce-based CSP instead.
 *
 * HSTS preload eligibility requires: max-age >= 1 year, includeSubDomains,
 * preload directive. Submit to https://hstspreload.org once stable in prod.
 */
const cspDirectives = [
  "default-src 'self'",
  // Allow inline JSON-LD + Vercel Analytics inline init script
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  // Tailwind v4 can inline some critical styles
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // next/font/google emits self-hosted fonts; allow data: for SVG masks
  "font-src 'self' data:",
  // npm download stats fetched server-side via api.npmjs.org; client only
  // hits same-origin. Vercel Analytics endpoint added.
  "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  // Disallow framing entirely
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Auto-upgrade insecure requests in dev
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // X-Robots-Tag fallback for crawlers that ignore robots.txt — explicitly
  // signals indexability (search bots) without changing AI-bot allowance.
  {
    key: "X-Robots-Tag",
    value: "index, follow, max-image-preview:large",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Disable Turbopack's experimental dev-time filesystem cache. In Next 16 it's
  // enabled by default and persists compiled chunks across dev-server restarts,
  // which makes large CSS rewrites (new selectors, pseudo-elements) appear
  // stale even after a clean restart. Opting out of dev FS cache makes
  // local feedback loop predictable; build cache stays untouched.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Long-cache the OG image asset — content is build-time-stable.
      // If branding changes, rename the file (cache-bust by URL).
      {
        source: "/opengraph-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, immutable",
          },
        ],
      },
      {
        source: "/twitter-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
