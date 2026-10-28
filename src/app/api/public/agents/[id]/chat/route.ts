import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_USER_MESSAGE, runAgentTurn } from "@/lib/agent-chat";
import { clientIp, corsPreflight, handle, HttpError, parseBody, rateLimit } from "@/lib/http";
import { getAgent } from "@/lib/repo";

export const maxDuration = 120;
export const OPTIONS = corsPreflight;

/** Public chat endpoint used by the embeddable widget. Rate limited per IP and per agent. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const agent = getAgent(id);
    if (!agent || !agent.widget_enabled) throw new HttpError(404, "Agent not available");

    rateLimit(`chat:${clientIp(req)}`, 15, 60_000); // 15 messages / minute / visitor
    rateLimit(`chat-agent:${id}`, 300, 60 * 60_000); // 300 messages / hour / agent (cost guard)

    const body = await parseBody(
      req,
      z.object({ message: z.string().trim().min(1).max(MAX_USER_MESSAGE), conversationId: z.string().max(64).optional() }),
    );
    const { conversationId, reply } = await runAgentTurn(agent, { ...body, source: "widget" });
    return NextResponse.json({ conversationId, reply });
  },
  { cors: true },
);
