import { NextResponse } from "next/server";
import { z } from "zod";
import { siteFor } from "@/lib/guards";
import { handle, HttpError, parseBody } from "@/lib/http";
import { deleteSite, getAgent, getSite, listSiteMessages, saveSiteHtml, updateSite } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const { id } = await ctx.params;
  const { site } = await siteFor(id);
  return site;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const site = await load(ctx);
  return NextResponse.json({ ...site, messages: listSiteMessages(site.id) });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(60).optional(),
  published: z.boolean().optional(),
  agent_id: z.string().nullable().optional(),
  /** Manual code edits from the editor. */
  html: z.string().max(2_000_000).optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const site = await load(ctx);
  const { html, ...patch } = await parseBody(req, patchSchema);
  if (patch.agent_id && !getAgent(patch.agent_id)) throw new HttpError(400, "Agent not found");
  if (patch.published && !(html ?? site.html).trim()) throw new HttpError(400, "Generate the page before publishing it");
  if (html !== undefined && html !== site.html) saveSiteHtml(site.id, html, "Manual code edit");
  return NextResponse.json(updateSite(site.id, patch));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const site = await load(ctx);
  deleteSite(site.id);
  return NextResponse.json({ ok: true });
});
