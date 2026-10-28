import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { isRunning } from "@/lib/apps/jobs";
import { ensurePreviewProxy } from "@/lib/apps/preview-proxy";
import { requireApp } from "@/lib/apps/repo";
import { appState, internalOrigin } from "@/lib/apps/runtime";

/** Container state + whether the dev server answers. Polled by the workspace UI. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  const state = await appState(app.id);
  let ready = false;
  let proxyError: string | null = null;
  if (state === "running") {
    // Re-create the preview proxy if CapHub restarted while the container kept running.
    await ensurePreviewProxy(app.id, app.port).catch((err) => (proxyError = (err as Error).message));
    const origin = await internalOrigin(app.id);
    try {
      if (origin) {
        const r = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000), redirect: "manual" });
        ready = r.status < 500 || r.status === 503; // 503 = app up, DB check failing
      }
    } catch {
      /* still starting */
    }
  }
  return NextResponse.json({ state, ready, port: app.port, working: isRunning(app.id), proxyError });
});
