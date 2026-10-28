import { siteFor } from "@/lib/guards";
import { handle, HttpError } from "@/lib/http";
import { getSite } from "@/lib/repo";

/** Downloads the raw generated HTML (without the platform runtime injected). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { site } = await siteFor(id);
  if (!site.html) throw new HttpError(400, "Nothing to export yet");
  return new Response(site.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${site.slug}.html"`,
    },
  });
});
