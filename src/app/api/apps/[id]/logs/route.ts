import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { requireApp } from "@/lib/apps/repo";
import { appLogs } from "@/lib/apps/runtime";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  const lines = Number(new URL(req.url).searchParams.get("lines")) || 300;
  return NextResponse.json({ logs: await appLogs(app.id, lines) });
});
