import { baseUrl } from "@/lib/http";
import { renderFunnelStep } from "@/lib/crm/public-pages";

/** Funnel step N (1-based). */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; step: string }> }) {
  const { slug, step } = await ctx.params;
  return renderFunnelStep(slug, Number(step), baseUrl(req));
}
