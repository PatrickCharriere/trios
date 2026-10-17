import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components keeps visited pages alive (hidden) across navigations, so
  // a game page could come back showing a previous game instead of the one
  // just opened. Every page here renders on the client, so it gains nothing.
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Browsers must always get the latest service worker.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async redirects() {
    // Games now live at /play/<id>; the old single-game address goes home, where every game is listed.
    return [{ source: "/play", destination: "/", permanent: false }];
  },
};

export default nextConfig;
