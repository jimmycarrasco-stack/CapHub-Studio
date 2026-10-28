import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // Pin the project root. Without this, a package-lock.json in a parent folder (e.g. your home
  // directory) makes Turbopack treat that folder as the root — slow, and it breaks CSS scanning.
  turbopack: { root: __dirname },
};

export default nextConfig;
