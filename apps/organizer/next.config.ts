import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/tokens"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "https", hostname: "cdn.clubrave.pe" },
      { protocol: "https", hostname: "api.clubrave.pe" },
    ],
  },
};

export default nextConfig;
