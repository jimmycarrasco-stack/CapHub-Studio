import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { requireApp } from "@/lib/apps/repo";
import { startApp } from "@/lib/apps/runtime";

export const maxDuration = 600; // first start may pull images

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  await startApp(app.id);
  return NextResponse.json({ ok: true });
});
