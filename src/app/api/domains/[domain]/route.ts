import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { getDomain, removeDomain, retargetDomain } from "@/lib/crm/domains";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ domain: string }> };

async function load(ctx: Ctx) {
  const d = getDomain(decodeURIComponent((await ctx.params).domain));
  if (!d) throw new HttpError(404, "Domain not found");
  await requireAccess(d.location_id, "admin");
  return d;
}

/** Point the domain at a different site or funnel. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const d = await load(ctx);
  const b = await parseBody(req, z.object({ targetType: z.enum(["site", "funnel"]), targetId: z.string().max(40) }));
  return NextResponse.json(retargetDomain(d, b.targetType, b.targetId));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const d = await load(ctx);
  removeDomain(d.domain);
  return NextResponse.json({ ok: true });
});
