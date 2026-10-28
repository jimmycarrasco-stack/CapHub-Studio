import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, parseBody, requireAdmin } from "@/lib/http";
import { addKnowledge, getAgent } from "@/lib/repo";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!getAgent(id)) throw new HttpError(404, "Agent not found");
  const { title, content } = await parseBody(
    req,
    z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(500_000) }),
  );
  return NextResponse.json(addKnowledge(id, title, content), { status: 201 });
});
