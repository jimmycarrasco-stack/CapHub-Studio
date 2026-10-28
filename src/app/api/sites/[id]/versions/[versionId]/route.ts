import { NextResponse } from "next/server";
import { handle, HttpError, requireAdmin } from "@/lib/http";
import { getSite, getSiteVersionHtml, saveSiteHtml } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

async function load(ctx: Ctx) {
  await requireAdmin();
  const { id, versionId } = await ctx.params;
  const site = getSite(id);
  if (!site) throw new HttpError(404, "Site not found");
  const vid = Number(versionId);
  const html = Number.isInteger(vid) ? getSiteVersionHtml(id, vid) : null;
  if (html === null) throw new HttpError(404, "Version not found");
  return { site, vid, html };
}

/** Returns a version's HTML (for previewing it). */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { html } = await load(ctx);
  return NextResponse.json({ html });
});

/** Restores a version by saving it as a new version (history is never rewritten). */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { site, vid, html } = await load(ctx);
  const versionId = saveSiteHtml(site.id, html, `Restored version #${vid}`);
  return NextResponse.json({ html, versionId });
});
