import { baseUrl } from "@/lib/http";
import { notFoundPage } from "@/lib/crm/public-pages";
import { getPublishedSiteBySlug } from "@/lib/repo";
import { injectRuntime, PUBLISHED_PAGE_HEADERS } from "@/lib/site-builder";

/**
 * Serves a published page. The CSP `sandbox` directive (without allow-same-origin)
 * runs the page in an opaque origin, so scripts in generated pages cannot make
 * authenticated requests to the admin app even though it's on the same host.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const site = getPublishedSiteBySlug(slug);
  if (!site) return notFoundPage("This page isn't published.");
  const html = injectRuntime(site.html, { siteId: site.id, baseUrl: baseUrl(req), agentId: site.agent_id, mode: "live" });
  return new Response(html, { headers: PUBLISHED_PAGE_HEADERS });
}
