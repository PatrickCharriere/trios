import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components keeps visited pages alive (hidden) across navigations, so
  // a game page could come back showing a previous game instead of the one
  // just opened. Every page here renders on the client, so it gains nothing.
  cacheComponents: false,
  async redirects() {
    // Games now live at /play/<id>; the old single-game address goes home, where every game is listed.
    return [{ source: "/play", destination: "/", permanent: false }];
  },
};

export default nextConfig;
