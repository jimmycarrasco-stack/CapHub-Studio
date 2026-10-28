import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { cancelJob } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  cancelJob(requireApp((await ctx.params).id).id);
  return NextResponse.json({ ok: true });
});
