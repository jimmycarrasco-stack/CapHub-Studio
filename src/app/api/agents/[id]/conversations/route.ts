import { NextResponse } from "next/server";
import { handle, HttpError, requireAdmin } from "@/lib/http";
import { getAgent, listConversations } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!getAgent(id)) throw new HttpError(404, "Agent not found");
  return NextResponse.json(listConversations(id));
});
