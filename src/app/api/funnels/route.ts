import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { createFunnel, listFunnels } from "@/lib/crm/funnels";
import { handle, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listFunnels(location.id));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(100), siteIds: z.array(z.string().max(40)).max(20).optional() }));
  return NextResponse.json(createFunnel(location.id, body.name, body.siteIds), { status: 201 });
});
