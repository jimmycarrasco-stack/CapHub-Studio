import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { createAgent, listAgents } from "@/lib/repo";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listAgents(location.id));
});

export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(80),
      description: z.string().max(300).optional(),
      instructions: z.string().max(20_000).optional(),
    }),
  );
  return NextResponse.json(createAgent(location.id, body), { status: 201 });
});
