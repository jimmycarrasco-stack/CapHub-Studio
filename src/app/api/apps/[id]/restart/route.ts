import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { requireApp } from "@/lib/apps/repo";
import { restartApp } from "@/lib/apps/runtime";

export const maxDuration = 600;

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  await restartApp(app.id);
  return NextResponse.json({ ok: true });
});
