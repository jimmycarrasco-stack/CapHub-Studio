import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { createPipeline, listPipelines } from "@/lib/crm/pipelines";
import { handle, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listPipelines(location.id));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(100), stages: z.array(z.string().trim().min(1).max(60)).min(1).max(20).optional() }));
  return NextResponse.json(createPipeline(location.id, body.name, body.stages), { status: 201 });
});
