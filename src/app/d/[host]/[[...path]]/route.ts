import { liveDomainFor } from "@/lib/crm/domains";
import { getFunnel } from "@/lib/crm/funnels";
import { notFoundPage, renderFunnelStep } from "@/lib/crm/public-pages";
import { getSite } from "@/lib/repo";
import { injectRuntime, PUBLISHED_PAGE_HEADERS } from "@/lib/site-builder";

/**
 * Serves custom domains. src/proxy.ts rewrites https://<custom-domain>/<path> to /d/<domain>/<path>
 * (the visitor's URL doesn't change). A site answers at "/"; a funnel answers at "/", "/2", "/3"…
 */
export async function GET(req: Request, ctx: { params: Promise<{ host: string; path?: string[] }> }) {
  const { host: rawHost, path = [] } = await ctx.params;
  const host = decodeURIComponent(rawHost);
  // Only reachable through the proxy rewrite for that same host (not via /d/ on another host).
  const requestHost = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (requestHost !== host) return notFoundPage();

  const found = liveDomainFor(host);
  if (!found) return notFoundPage("This domain isn't connected to a page yet.");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  if (found.redirectTo) {
    return Response.redirect(`${proto}://${found.redirectTo}/${path.join("/")}`, 301);
  }
  const origin = `${proto}://${host}`;
  const d = found.domain;

  if (d.target_type === "site") {
    if (path.length) return notFoundPage();
    const site = getSite(d.target_id);
    if (!site || site.location_id !== d.location_id || !site.html) return notFoundPage("This page hasn't been built yet.");
    if (!site.published) return notFoundPage("This page isn't published yet.");
    const html = injectRuntime(site.html, { siteId: site.id, baseUrl: origin, agentId: site.agent_id, mode: "live" });
    return new Response(html, { headers: PUBLISHED_PAGE_HEADERS });
  }

  const funnel = getFunnel(d.target_id);
  if (!funnel || funnel.location_id !== d.location_id) return notFoundPage();
  const step = path.length === 0 ? 1 : path.length === 1 && /^\d{1,3}$/.test(path[0]) ? Number(path[0]) : NaN;
  if (!Number.isInteger(step)) return notFoundPage();
  return renderFunnelStep(funnel.slug, step, origin, (n) => `${origin}/${n}`);
}
