import "server-only";
import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { isAppHost } from "../app-host";
import { db } from "../db";
import { HttpError } from "../errors";
import { getSite } from "../repo";
import { getFunnel } from "./funnels";

/**
 * Custom domains for sites and funnels. A domain is claimed by one sub-account and only goes live
 * after its owner proves control with a DNS TXT record, so nobody can attach a domain they don't own.
 * Requests for a live domain are routed by src/proxy.ts to /d/<domain>/<path>.
 */

export interface SiteDomain {
  domain: string;
  location_id: string;
  target_type: "site" | "funnel";
  target_id: string;
  verify_token: string;
  verified_at: string | null;
  created_at: string;
  target_name?: string | null;
}

export { isAppHost };

export const TXT_PREFIX = "_caphub";
export const txtValue = (d: Pick<SiteDomain, "verify_token">) => `caphub-verify=${d.verify_token}`;

/** Normalizes user input ("https://Book.Acme.com/path") to a hostname, or throws a friendly error. */
export function normalizeDomain(input: string) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) throw new HttpError(400, "Enter a domain like book.yourbusiness.com");
  if (isAppHost(d)) throw new HttpError(400, "That's the address of CapHub itself — use your own domain");
  return d;
}

const withName = (d: SiteDomain): SiteDomain => ({
  ...d,
  target_name: d.target_type === "site" ? (getSite(d.target_id)?.name ?? null) : (getFunnel(d.target_id)?.name ?? null),
});

export function listDomains(locationId: string): SiteDomain[] {
  return (db().prepare("SELECT * FROM site_domains WHERE location_id = ? ORDER BY created_at").all(locationId) as SiteDomain[]).map(withName);
}

export function getDomain(domain: string): SiteDomain | null {
  const d = db().prepare("SELECT * FROM site_domains WHERE domain = ?").get(domain.toLowerCase()) as SiteDomain | undefined;
  return d ? withName(d) : null;
}

function checkTarget(locationId: string, type: "site" | "funnel", id: string) {
  const owner = type === "site" ? getSite(id)?.location_id : getFunnel(id)?.location_id;
  if (owner !== locationId) throw new HttpError(400, `That ${type} doesn't exist in this sub-account`);
}

export function addDomain(locationId: string, input: { domain: string; targetType: "site" | "funnel"; targetId: string }) {
  const domain = normalizeDomain(input.domain);
  checkTarget(locationId, input.targetType, input.targetId);
  const existing = getDomain(domain);
  if (existing) {
    throw new HttpError(409, existing.location_id === locationId ? "That domain is already connected — change where it points instead" : "That domain is already connected to another account");
  }
  db()
    .prepare("INSERT INTO site_domains (domain, location_id, target_type, target_id, verify_token) VALUES (?, ?, ?, ?, ?)")
    .run(domain, locationId, input.targetType, input.targetId, randomBytes(12).toString("hex"));
  return getDomain(domain)!;
}

export function retargetDomain(d: SiteDomain, targetType: "site" | "funnel", targetId: string) {
  checkTarget(d.location_id, targetType, targetId);
  db().prepare("UPDATE site_domains SET target_type = ?, target_id = ? WHERE domain = ?").run(targetType, targetId, d.domain);
  return getDomain(d.domain)!;
}

export function removeDomain(domain: string) {
  db().prepare("DELETE FROM site_domains WHERE domain = ?").run(domain);
}

type Resolver = { resolveTxt: (name: string) => Promise<string[][]>; resolve4: (name: string) => Promise<string[]>; resolveCname: (name: string) => Promise<string[]> };
const g = globalThis as unknown as { __caphubDns?: Resolver };
/** Tests can replace DNS. */
export function __setResolver(r: Resolver | undefined) {
  g.__caphubDns = r;
}
const resolver = (): Resolver => g.__caphubDns ?? dns;

/**
 * Checks the TXT record (ownership) and, for information, where the domain points.
 * Marks the domain verified when the TXT record matches.
 */
export async function verifyDomain(d: SiteDomain) {
  const r = resolver();
  let txtFound = false;
  let txtError: string | null = null;
  try {
    const records = await r.resolveTxt(`${TXT_PREFIX}.${d.domain}`);
    txtFound = records.some((parts) => parts.join("").trim() === txtValue(d));
    if (!txtFound) txtError = "The TXT record was found but its value doesn't match yet.";
  } catch (err) {
    const code = (err as { code?: string }).code;
    txtError = code === "ENOTFOUND" || code === "ENODATA" ? "No TXT record found yet (DNS changes can take up to an hour)." : `DNS lookup failed (${code ?? "error"}).`;
  }

  // Where does it point? (informational — it must point at your CapHub server for visitors to reach it)
  let pointsTo: string[] = [];
  try {
    pointsTo = (await r.resolveCname(d.domain)).map((x) => `CNAME ${x}`);
  } catch {
    try {
      pointsTo = (await r.resolve4(d.domain)).map((x) => `A ${x}`);
    } catch {
      pointsTo = [];
    }
  }

  if (txtFound && !d.verified_at) db().prepare("UPDATE site_domains SET verified_at = datetime('now') WHERE domain = ?").run(d.domain);
  return { verified: txtFound || !!d.verified_at, txtError: txtFound ? null : txtError, pointsTo, domain: getDomain(d.domain)! };
}

/** For the proxy route: the live domain record for a request host (also handles www.). */
export function liveDomainFor(host: string): { domain: SiteDomain; redirectTo?: string } | null {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  const d = getDomain(h);
  if (d?.verified_at) return { domain: d };
  // www.example.com → example.com (and the reverse) when only one is connected
  const alt = h.startsWith("www.") ? h.slice(4) : `www.${h}`;
  const a = getDomain(alt);
  if (a?.verified_at) return { domain: a, redirectTo: a.domain };
  return null;
}

/** True if `url` is on a live custom domain belonging to this sub-account (safe redirect target). */
export function isOwnDomainUrl(locationId: string, url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const d = getDomain(u.hostname);
    return !!d && !!d.verified_at && d.location_id === locationId;
  } catch {
    return false;
  }
}
