/**
 * Hostnames that belong to the CapHub app itself (never treated as custom domains): localhost,
 * IP addresses, *.local, PUBLIC_BASE_URL's host, and any in CAPHUB_APP_HOSTS (comma-separated).
 * No imports — safe to use from src/proxy.ts.
 */
export function isAppHost(host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return true; // IPv4 / IPv6
  const base = process.env.PUBLIC_BASE_URL;
  if (base) {
    try {
      if (new URL(base).hostname.toLowerCase() === h) return true;
    } catch {
      /* ignore */
    }
  }
  return (process.env.CAPHUB_APP_HOSTS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(h);
}
