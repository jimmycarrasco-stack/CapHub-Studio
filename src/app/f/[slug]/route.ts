import { baseUrl } from "@/lib/http";
import { renderFunnelStep } from "@/lib/crm/public-pages";

/** First step of a funnel. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return renderFunnelStep((await ctx.params).slug, 1, baseUrl(req));
}
