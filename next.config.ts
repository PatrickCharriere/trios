import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components keeps visited pages alive (hidden) across navigations, so
  // /play would come back showing the previous game instead of the new save.
  // Every page here renders on the client, so it gains nothing from it.
  cacheComponents: false,
};

export default nextConfig;
