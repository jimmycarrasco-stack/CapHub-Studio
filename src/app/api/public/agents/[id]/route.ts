import { NextResponse } from "next/server";
import { corsPreflight, handle, HttpError } from "@/lib/http";
import { getAgent } from "@/lib/repo";

export const OPTIONS = corsPreflight;

/** Public widget config. Exposes display fields only — never instructions or knowledge. */
export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const agent = getAgent(id);
    if (!agent || !agent.widget_enabled) throw new HttpError(404, "Agent not available");
    return NextResponse.json({ id: agent.id, name: agent.name, greeting: agent.greeting, color: agent.widget_color });
  },
  { cors: true },
);
