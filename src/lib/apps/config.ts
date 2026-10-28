import path from "node:path";

/**
 * Runtime configuration for the App Builder. All optional; defaults suit Docker Desktop / Colima on a Mac.
 */
export const appConfig = {
  /** Image each app runs in. Must provide node, npm, bash and util-linux (setpriv). */
  appImage: process.env.CAPHUB_APP_IMAGE || "node:22-bookworm-slim",
  /** Postgres image shared by all apps (one database + role per app). */
  pgImage: process.env.CAPHUB_PG_IMAGE || "postgres:16-alpine",
  /** Host interface the app previews bind to. 127.0.0.1 keeps them private to this machine. */
  bindHost: process.env.CAPHUB_APP_BIND || "127.0.0.1",
  portRange: (process.env.CAPHUB_APP_PORTS || "4100-4999").split("-").map(Number) as [number, number],
  /** Extra `docker run` args for every app container (advanced: proxies, CA certs). Space-separated. */
  extraRunArgs: (process.env.CAPHUB_DOCKER_EXTRA_ARGS || "").split(/\s+/).filter(Boolean),
  memory: process.env.CAPHUB_APP_MEMORY || "2g",
  cpus: process.env.CAPHUB_APP_CPUS || "2",
  network: "caphub-net",
  pgContainer: "caphub-postgres",
  pgVolume: "caphub-pgdata",
  npmCacheVolume: "caphub-npm-cache",
};

export function dataDir() {
  return process.env.DATABASE_PATH ? path.dirname(path.resolve(process.env.DATABASE_PATH)) : path.join(process.cwd(), "data");
}

export const appsRoot = () => path.join(dataDir(), "apps");
export const workspaceDir = (id: string) => path.join(appsRoot(), id, "workspace");
export const snapshotsDir = (id: string) => path.join(appsRoot(), id, "snapshots");
export const runtimeDir = () => path.join(dataDir(), "runtime");
export const templatesDir = () => path.join(process.cwd(), "templates");

export const containerName = (id: string) => `caphub-app-${id.toLowerCase()}`;
export const volumeName = (id: string, kind: "modules" | "next") => `caphub-app-${id.toLowerCase()}-${kind}`;

/** Directories that never leave the container volume and are skipped by snapshots/zips/file tree. */
export const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", ".caphub", ".turbo"]);
