import { baseUrl } from "@/lib/http";
import { getPublishedSiteBySlug } from "@/lib/repo";
import { injectRuntime } from "@/lib/site-builder";

/**
 * Serves a published page. The CSP `sandbox` directive (without allow-same-origin)
 * runs the page in an opaque origin, so scripts in generated pages cannot make
 * authenticated requests to the admin app even though it's on the same host.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const site = getPublishedSiteBySlug(slug);
  if (!site) {
    return new Response("<!doctype html><title>Not found</title><p style='font-family:system-ui;padding:2rem'>This page isn't published.</p>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const html = injectRuntime(site.html, { siteId: site.id, baseUrl: baseUrl(req), agentId: site.agent_id, mode: "live" });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-store",
    },
  });
}
