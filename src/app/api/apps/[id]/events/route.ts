import { appFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { streamJob } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";

export const maxDuration = 3600;

/** NDJSON stream of the current AI turn's events. `?from=N` resumes after a reconnect. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  const from = Number(new URL(req.url).searchParams.get("from")) || 0;
  return new Response(streamJob(app.id, from), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
