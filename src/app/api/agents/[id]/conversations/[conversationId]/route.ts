import { NextResponse } from "next/server";
import { agentFor } from "@/lib/guards";
import { handle, HttpError } from "@/lib/http";
import { getConversationForAgent } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; conversationId: string }> }) => {
  const { id, conversationId } = await ctx.params;
  await agentFor(id);
  const messages = getConversationForAgent(id, conversationId);
  if (!messages) throw new HttpError(404, "Conversation not found");
  return NextResponse.json(messages);
});
