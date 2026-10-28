import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { startAgentJob } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";

/** Starts an AI turn in the background. Follow progress via /events. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  const { prompt } = await parseBody(req, z.object({ prompt: z.string().trim().min(1).max(20_000) }));
  startAgentJob(app.id, prompt);
  return NextResponse.json({ ok: true }, { status: 202 });
});
