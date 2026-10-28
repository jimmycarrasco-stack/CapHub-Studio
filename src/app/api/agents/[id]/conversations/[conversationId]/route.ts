import { NextResponse } from "next/server";
import { handle, HttpError, requireAdmin } from "@/lib/http";
import { getConversationForAgent } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; conversationId: string }> }) => {
  await requireAdmin();
  const { id, conversationId } = await ctx.params;
  const messages = getConversationForAgent(id, conversationId);
  if (!messages) throw new HttpError(404, "Conversation not found");
  return NextResponse.json(messages);
});
