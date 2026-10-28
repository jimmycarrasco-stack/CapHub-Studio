import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
};

export default nextConfig;
