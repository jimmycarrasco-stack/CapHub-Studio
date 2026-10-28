import "server-only";
import http from "node:http";
import net from "node:net";
import { appConfig, containerName } from "./config";
import { docker } from "./docker";

/**
 * Preview proxy.
 *
 * Browsers send cookies for a host to every port on that host, so a generated app served
 * directly on localhost:<port> would receive CapHub's admin session cookie. Generated code
 * is untrusted, so app containers publish only an internal ephemeral port, and CapHub
 * listens on the app's preview port and forwards traffic after removing CapHub's own
 * cookies. WebSocket upgrades (Next.js hot reload) are forwarded too.
 */

const CAPHUB_COOKIE_PREFIX = "caphub_";

interface Entry {
  server: http.Server;
  target: number | null;
}

const g = globalThis as unknown as { __caphubPreview?: Map<string, Entry> };
const proxies = (g.__caphubPreview ??= new Map());

/** The host port Docker assigned to the container's :3000. */
export async function internalPort(appId: string): Promise<number | null> {
  const r = await docker(["port", containerName(appId), "3000/tcp"], { timeoutMs: 10_000 });
  if (r.code !== 0) return null;
  const m = r.stdout.match(/:(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}

export function stripCaphubCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return cookieHeader;
  const kept = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !c.toLowerCase().startsWith(CAPHUB_COOKIE_PREFIX));
  return kept.length ? kept.join("; ") : undefined;
}

async function target(appId: string, entry: Entry, refresh = false) {
  if (refresh || !entry.target) entry.target = await internalPort(appId);
  return entry.target;
}

function unavailable(res: http.ServerResponse) {
  res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "2" });
  res.end(
    "<!doctype html><meta http-equiv=refresh content=3><body style='font:15px system-ui;padding:2rem;color:#555'>The app is starting… this page will refresh.</body>",
  );
}

export async function ensurePreviewProxy(appId: string, port: number) {
  const existing = proxies.get(appId);
  if (existing) {
    await target(appId, existing, true);
    return;
  }
  const entry: Entry = { server: http.createServer(), target: null };
  proxies.set(appId, entry);

  entry.server.on("request", async (req, res) => {
    const forward = async (retry: boolean) => {
      const t = await target(appId, entry, retry);
      if (!t) return unavailable(res);
      const headers = { ...req.headers, cookie: stripCaphubCookies(req.headers.cookie) };
      if (!headers.cookie) delete headers.cookie;
      const upstream = http.request({ host: "127.0.0.1", port: t, method: req.method, path: req.url, headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      });
      upstream.on("error", (err: NodeJS.ErrnoException) => {
        if (!retry && err.code === "ECONNREFUSED") return void forward(true); // container was recreated → new port
        if (!res.headersSent) unavailable(res);
        else res.destroy();
      });
      req.pipe(upstream);
    };
    await forward(false);
  });

  entry.server.on("upgrade", async (req, socket, head) => {
    const t = await target(appId, entry);
    if (!t) return socket.destroy();
    const up = net.connect(t, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const [k, v] = [req.rawHeaders[i], req.rawHeaders[i + 1]];
        if (k.toLowerCase() === "cookie") {
          const c = stripCaphubCookies(v);
          if (c) lines.push(`${k}: ${c}`);
        } else lines.push(`${k}: ${v}`);
      }
      up.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) up.write(head);
      up.pipe(socket).pipe(up);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    entry.server.once("error", (err) => {
      proxies.delete(appId);
      reject(new Error(`Preview port ${port} is in use by another program. ${(err as Error).message}`));
    });
    entry.server.listen(port, appConfig.bindHost, () => resolve());
  });
  await target(appId, entry, true);
}

export function closePreviewProxy(appId: string) {
  const e = proxies.get(appId);
  if (!e) return;
  proxies.delete(appId);
  e.server.close();
  e.server.closeAllConnections?.();
}
