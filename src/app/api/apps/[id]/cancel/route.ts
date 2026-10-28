import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { cancelJob } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  cancelJob(app.id);
  return NextResponse.json({ ok: true });
});
