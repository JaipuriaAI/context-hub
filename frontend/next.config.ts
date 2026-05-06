import type { NextConfig } from "next";

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
};

export default nextConfig;
