import { NextResponse } from "next/server";
import { agentFor } from "@/lib/guards";
import { handle, HttpError } from "@/lib/http";
import { getAgent, listConversations } from "@/lib/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await agentFor(id);
  return NextResponse.json(listConversations(id));
});
