import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { HttpError } from "../errors";
import { appConfig, containerName, runtimeDir, volumeName, workspaceDir } from "./config";
import { clip, docker, dockerOk, dockerStatus, stripAnsi } from "./docker";
import { closePreviewProxy, ensurePreviewProxy, internalPort } from "./preview-proxy";
import { getAppSecrets, requireApp, type AppRow } from "./repo";

/**
 * Container lifecycle for generated apps.
 *
 *   caphub-net (bridge)
 *   ├── caphub-postgres          shared Postgres; one database + role per app; not published to the host
 *   └── caphub-app-<id>          node image, workspace bind-mounted at /app, dev server on :3000
 *                                published to 127.0.0.1:<port> for the preview
 *
 * The container's main process is `caphub.sh start` (below), which installs deps, syncs the schema,
 * then keeps `next dev` running (restarting it if it crashes) so `docker exec` always works.
 *
 * Everything inside the container runs as the user that owns the project folder (/app), so files
 * written by npm, tsc or Next stay editable by CapHub on the host (on macOS that's your user).
 */

const CAPHUB_SH = `#!/bin/bash
# Managed by CapHub Studio. Usage: caphub.sh start | caphub.sh exec "<command>"
set -u
APP_UID=$(stat -c %u /app)
APP_GID=$(stat -c %g /app)
mkdir -p /home/app

as_app() {
  exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --clear-groups --reset-env env \\
    HOME=/home/app USER=app PATH="$PATH" \\
    DATABASE_URL="$DATABASE_URL" AUTH_SECRET="$AUTH_SECRET" \\
    SESSION_COOKIE_NAME="\${SESSION_COOKIE_NAME:-session}" \\
    NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true \\
    npm_config_cache=/var/cache/caphub-npm npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false \\
    HTTP_PROXY="\${HTTP_PROXY:-}" HTTPS_PROXY="\${HTTPS_PROXY:-}" NO_PROXY="\${NO_PROXY:-}" NODE_EXTRA_CA_CERTS="\${NODE_EXTRA_CA_CERTS:-}" \\
    CI="\${CI:-}" bash -c "$1"
}

if [ "\${1:-}" = "exec" ]; then
  cd /app && as_app "$2"
fi

# start: give the app user its writable volumes, then run the dev loop as that user.
chown "$APP_UID:$APP_GID" /app/node_modules /app/.next /home/app /var/cache/caphub-npm 2>/dev/null || true
as_app '
cd /app
stamp() { cat package.json package-lock.json 2>/dev/null | sha1sum | cut -c1-40; }
if [ ! -f node_modules/.caphub-stamp ] || [ "$(cat node_modules/.caphub-stamp)" != "$(stamp)" ]; then
  echo "[caphub] installing dependencies…"
  if npm install; then stamp > node_modules/.caphub-stamp; else echo "[caphub] npm install failed"; fi
fi
echo "[caphub] syncing database schema…"
npm run --silent db:push || echo "[caphub] db:push failed — see errors above"
while true; do
  echo "[caphub] starting dev server"
  npm run dev
  echo "[caphub] dev server exited with code $? — restarting in 3s"
  sleep 3
done'
`;

async function ensureStartScript() {
  const dir = runtimeDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "caphub.sh");
  const cur = await fs.readFile(file, "utf8").catch(() => "");
  if (cur !== CAPHUB_SH) await fs.writeFile(file, CAPHUB_SH, { mode: 0o755 });
  return file;
}

async function requireDocker() {
  const s = await dockerStatus();
  if (!s.available) throw new HttpError(503, s.error ?? "Docker is not available");
}

async function ensureNetwork() {
  const r = await docker(["network", "inspect", appConfig.network], { timeoutMs: 15_000 });
  if (r.code !== 0) await dockerOk(["network", "create", appConfig.network], { timeoutMs: 30_000 });
}

function pgSuperPassword(): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'pg_super_password'").get() as { value: string } | undefined;
  if (row) return decrypt(row.value);
  const pw = randomBytes(24).toString("base64url");
  db().prepare("INSERT INTO settings (key, value) VALUES ('pg_super_password', ?)").run(encrypt(pw));
  return pw;
}

async function containerState(name: string): Promise<"running" | "exited" | "created" | "missing" | string> {
  const r = await docker(["inspect", "-f", "{{.State.Status}}", name], { timeoutMs: 15_000 });
  return r.code === 0 ? r.stdout.trim() : "missing";
}

async function psql(sql: string) {
  return docker(["exec", appConfig.pgContainer, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", sql], { timeoutMs: 30_000 });
}

export async function ensurePostgres() {
  await ensureNetwork();
  const state = await containerState(appConfig.pgContainer);
  if (state === "missing") {
    await dockerOk(
      [
        "run", "-d", "--name", appConfig.pgContainer, "--network", appConfig.network, "--restart", "unless-stopped",
        "-e", `POSTGRES_PASSWORD=${pgSuperPassword()}`,
        "-v", `${appConfig.pgVolume}:/var/lib/postgresql/data`,
        "--label", "caphub=postgres",
        appConfig.pgImage,
      ],
      { timeoutMs: 600_000 }, // first run may pull the image
    );
  } else if (state !== "running") {
    await dockerOk(["start", appConfig.pgContainer], { timeoutMs: 60_000 });
  }
  for (let i = 0; i < 60; i++) {
    if ((await docker(["exec", appConfig.pgContainer, "pg_isready", "-U", "postgres"], { timeoutMs: 10_000 })).code === 0) {
      // pg_isready can succeed during initdb's temporary server; confirm with a real query.
      if ((await psql("select 1")).code === 0) return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new HttpError(503, "Postgres did not become ready in time");
}

/** Creates the app's role + database if missing (idempotent). Identifiers are app_<lowercase id>. */
export async function ensureAppDatabase(app: AppRow) {
  if (!/^app_[a-z0-9]+$/.test(app.db_name)) throw new Error("Invalid database name");
  const { dbPassword } = getAppSecrets(app.id);
  const pw = dbPassword.replace(/'/g, "''");
  const role = await psql(`SELECT 1 FROM pg_roles WHERE rolname = '${app.db_name}'`);
  if (role.stdout.trim() !== "1") {
    const r = await psql(`CREATE ROLE ${app.db_name} LOGIN PASSWORD '${pw}'`);
    if (r.code !== 0) throw new Error(`Could not create database role: ${r.stderr.trim()}`);
  }
  const exists = await psql(`SELECT 1 FROM pg_database WHERE datname = '${app.db_name}'`);
  if (exists.stdout.trim() !== "1") {
    const r = await psql(`CREATE DATABASE ${app.db_name} OWNER ${app.db_name}`);
    if (r.code !== 0) throw new Error(`Could not create database: ${r.stderr.trim()}`);
    await psql(`REVOKE ALL ON DATABASE ${app.db_name} FROM PUBLIC`);
  }
}

function databaseUrl(app: AppRow) {
  const { dbPassword } = getAppSecrets(app.id);
  return `postgresql://${app.db_name}:${encodeURIComponent(dbPassword)}@${appConfig.pgContainer}:5432/${app.db_name}`;
}

export type AppRunState = "running" | "stopped" | "missing";

export async function appState(appId: string): Promise<AppRunState> {
  const s = await containerState(containerName(appId));
  return s === "running" ? "running" : s === "missing" ? "missing" : "stopped";
}

/** Creates (if needed) and starts the app container. Returns once the container is running (not necessarily ready). */
export async function startApp(appId: string) {
  await requireDocker();
  const app = requireApp(appId);
  const name = containerName(appId);
  const state = await containerState(name);
  if (state === "running") return ensurePreviewProxy(appId, app.port);
  if (state !== "missing") {
    await dockerOk(["start", name], { timeoutMs: 60_000 });
    return ensurePreviewProxy(appId, app.port);
  }

  await ensurePostgres();
  await ensureAppDatabase(app);
  const startSh = await ensureStartScript();
  const { authSecret } = getAppSecrets(appId);

  await dockerOk(
    [
      "run", "-d", "--name", name, "--hostname", `app-${appId}`,
      "--network", appConfig.network,
      "--label", "caphub=app", "--label", `caphub.app=${appId}`,
      // Only an internal ephemeral port; the browser reaches the app through CapHub's preview proxy.
      "-p", "127.0.0.1::3000",
      "-v", `${workspaceDir(appId)}:/app`,
      "-v", `${volumeName(appId, "modules")}:/app/node_modules`,
      "-v", `${volumeName(appId, "next")}:/app/.next`,
      "-v", `${appConfig.npmCacheVolume}:/var/cache/caphub-npm`,
      "-v", `${startSh}:/caphub.sh:ro`,
      "-e", `DATABASE_URL=${databaseUrl(app)}`,
      "-e", `AUTH_SECRET=${authSecret}`,
      "-e", `SESSION_COOKIE_NAME=s_${appId}`,
      "-w", "/app",
      // Isolation: no extra privileges beyond what start.sh needs to chown volumes and drop to uid 1000.
      "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "SETUID", "--cap-add", "SETGID", "--cap-add", "DAC_OVERRIDE", "--cap-add", "FOWNER",
      "--security-opt", "no-new-privileges",
      "--pids-limit", "1024", "--memory", appConfig.memory, "--cpus", appConfig.cpus,
      "--add-host", "host.docker.internal:host-gateway",
      ...appConfig.extraRunArgs,
      appConfig.appImage,
      "bash", "/caphub.sh", "start",
    ],
    { timeoutMs: 600_000 }, // first run may pull the image
  );
  await ensurePreviewProxy(appId, app.port);
}

export async function stopApp(appId: string) {
  await docker(["stop", "-t", "5", containerName(appId)], { timeoutMs: 30_000 });
}

export async function restartApp(appId: string) {
  const state = await containerState(containerName(appId));
  if (state === "missing") return startApp(appId);
  await dockerOk(["restart", "-t", "5", containerName(appId)], { timeoutMs: 60_000 });
  await ensurePreviewProxy(appId, requireApp(appId).port); // internal port may change
}

/** Removes the container (and optionally its volumes). Workspace files are untouched. */
export async function removeContainer(appId: string, opts: { volumes?: boolean } = {}) {
  closePreviewProxy(appId);
  await docker(["rm", "-f", containerName(appId)], { timeoutMs: 30_000 });
  if (opts.volumes) await docker(["volume", "rm", "-f", volumeName(appId, "modules"), volumeName(appId, "next")], { timeoutMs: 30_000 });
}

export async function dropAppDatabase(app: AppRow) {
  if (!/^app_[a-z0-9]+$/.test(app.db_name)) return;
  if ((await containerState(appConfig.pgContainer)) !== "running") return;
  await psql(`DROP DATABASE IF EXISTS ${app.db_name} WITH (FORCE)`);
  await psql(`DROP ROLE IF EXISTS ${app.db_name}`);
}

export async function appLogs(appId: string, lines = 200) {
  const r = await docker(["logs", "--tail", String(Math.min(Math.max(lines, 1), 2000)), containerName(appId)], { timeoutMs: 15_000 });
  if (r.code !== 0) return r.stderr.includes("No such container") ? "(the app has not been started yet)" : stripAnsi(r.stderr);
  // docker logs writes the container's stdout and stderr to our stdout/stderr; merge them.
  return stripAnsi(r.stdout + r.stderr);
}

/** Runs a shell command inside the app container as the project's owner (never as root). */
export async function execInApp(appId: string, command: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  if ((await appState(appId)) !== "running") throw new HttpError(409, "The app container isn't running");
  await ensureStartScript(); // keep the mounted helper current
  const r = await docker(["exec", "-e", "CI=1", containerName(appId), "bash", "/caphub.sh", "exec", command], {
    timeoutMs: opts.timeoutMs ?? 120_000,
    signal: opts.signal,
  });
  return { ...r, stdout: stripAnsi(r.stdout), stderr: stripAnsi(r.stderr) };
}

/** Direct (server-side) address of the app's dev server, bypassing the preview proxy. */
export async function internalOrigin(appId: string) {
  const port = await internalPort(appId);
  return port ? `http://127.0.0.1:${port}` : null;
}

/** Waits until the dev server answers (any HTTP status). */
export async function waitForHttp(app: AppRow, timeoutMs = 240_000, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    try {
      const origin = await internalOrigin(app.id);
      if (origin) {
        await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000), redirect: "manual" });
        return true;
      }
    } catch {
      /* not up yet */
    }
    if ((await appState(app.id)) !== "running") return false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Fetches a page from the running app the way a browser would, summarizing the result for the agent. */
export async function checkPage(appId: string, pagePath: string) {
  const p = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  const origin = await internalOrigin(appId);
  if (!origin) return { status: 0, summary: "The app container isn't running. Use restart_app." };
  let status = 0;
  let body = "";
  let location: string | null = null;
  try {
    const res = await fetch(`${origin}${p}`, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
    status = res.status;
    location = res.headers.get("location");
    body = await res.text();
  } catch (err) {
    return { status: 0, summary: `Request failed: ${(err as Error).message}. Is the dev server running? Check get_logs.` };
  }
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lines = [`GET ${p} → ${status}${location ? ` (redirect to ${location})` : ""}`];
  if (location && /\/login/.test(location)) {
    lines.push(
      "Note: this page requires sign-in, so it was NOT compiled or rendered by this check. Verify it with `npm run typecheck` and get_logs, and check any public pages that use the same components.",
    );
  }
  if (title) lines.push(`Title: ${title}`);
  if (status >= 500 || /Unhandled Runtime Error|Build Error|Failed to compile|Module not found/i.test(body)) {
    lines.push("The page errored. Recent server logs:", clip((await appLogs(appId, 60)).trim(), 6000));
  } else {
    lines.push(`Visible text: ${clip(text, 1500)}`);
  }
  return { status, summary: lines.join("\n") };
}

/** One-line environment check for the Settings page. */
export async function runtimeStatus() {
  const d = await dockerStatus();
  if (!d.available) return { docker: d, postgres: "unavailable" as string, images: appConfig };
  const pg = await containerState(appConfig.pgContainer);
  return { docker: d, postgres: pg, images: appConfig };
}
