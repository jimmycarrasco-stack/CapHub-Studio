import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_USER_MESSAGE, runAgentTurn } from "@/lib/agent-chat";
import { handle, HttpError, parseBody, requireAdmin } from "@/lib/http";
import { getAgent } from "@/lib/repo";

export const maxDuration = 120;

/** Admin playground chat — works even when the public widget is disabled. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) throw new HttpError(404, "Agent not found");
  const body = await parseBody(
    req,
    z.object({ message: z.string().trim().min(1).max(MAX_USER_MESSAGE), conversationId: z.string().max(64).optional() }),
  );
  return NextResponse.json(await runAgentTurn(agent, { ...body, source: "playground" }));
});
