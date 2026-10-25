import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  /* config options here */
  experimental: {
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
