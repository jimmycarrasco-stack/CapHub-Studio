import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { createAgent, listAgents } from "@/lib/repo";

export const GET = handle(async () => {
  await requireAdmin();
  return NextResponse.json(listAgents());
});

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(80),
      description: z.string().max(300).optional(),
      instructions: z.string().max(20_000).optional(),
    }),
  );
  return NextResponse.json(createAgent(body), { status: 201 });
});
