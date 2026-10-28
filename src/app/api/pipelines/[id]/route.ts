import { NextResponse } from "next/server";
import { z } from "zod";
import { pipelineFor } from "@/lib/guards";
import { deletePipeline, listOpportunities, updatePipeline } from "@/lib/crm/pipelines";
import { handle, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: p } = await pipelineFor((await ctx.params).id);
  return NextResponse.json({ pipeline: p, opportunities: listOpportunities(p.id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: p } = await pipelineFor((await ctx.params).id);
  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      stages: z.array(z.object({ id: z.string().max(40).optional(), name: z.string().trim().min(1).max(60) })).min(1).max(20).optional(),
    }),
  );
  return NextResponse.json(updatePipeline(p.id, body));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: p } = await pipelineFor((await ctx.params).id, "admin");
  deletePipeline(p.id);
  return NextResponse.json({ ok: true });
});
