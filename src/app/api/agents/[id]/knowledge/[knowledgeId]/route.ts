import { NextResponse } from "next/server";
import { agentFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { deleteKnowledge } from "@/lib/repo";

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string; knowledgeId: string }> }) => {
  const { id, knowledgeId } = await ctx.params;
  await agentFor(id);
  deleteKnowledge(id, knowledgeId);
  return NextResponse.json({ ok: true });
});
