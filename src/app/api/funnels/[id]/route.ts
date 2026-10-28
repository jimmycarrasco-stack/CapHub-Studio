import { NextResponse } from "next/server";
import { z } from "zod";
import { funnelFor } from "@/lib/guards";
import { deleteFunnel, updateFunnel } from "@/lib/crm/funnels";
import { handle, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: f } = await funnelFor((await ctx.params).id);
  const body = await parseBody(
    req,
    z.object({ name: z.string().trim().min(1).max(100).optional(), slug: z.string().trim().min(1).max(60).optional(), siteIds: z.array(z.string().max(40)).max(20).optional() }),
  );
  return NextResponse.json(updateFunnel(f.id, body));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: f } = await funnelFor((await ctx.params).id);
  deleteFunnel(f.id);
  return NextResponse.json({ ok: true });
});
