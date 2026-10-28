import { NextResponse } from "next/server";
import { z } from "zod";
import { agentFor } from "@/lib/guards";
import { handle, HttpError, parseBody } from "@/lib/http";
import { addKnowledge, getAgent } from "@/lib/repo";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await agentFor(id);
  const { title, content } = await parseBody(
    req,
    z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(500_000) }),
  );
  return NextResponse.json(addKnowledge(id, title, content), { status: 201 });
});
