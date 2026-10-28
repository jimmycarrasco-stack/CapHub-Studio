import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { deleteKnowledge } from "@/lib/repo";

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string; knowledgeId: string }> }) => {
  await requireAdmin();
  const { id, knowledgeId } = await ctx.params;
  deleteKnowledge(id, knowledgeId);
  return NextResponse.json({ ok: true });
});
