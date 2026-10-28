import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow the CapHub Studio preview (served from localhost on another port) to load dev assets.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
