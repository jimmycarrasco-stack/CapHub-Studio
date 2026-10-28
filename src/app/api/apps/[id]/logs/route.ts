import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { requireApp } from "@/lib/apps/repo";
import { appLogs } from "@/lib/apps/runtime";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  const lines = Number(new URL(req.url).searchParams.get("lines")) || 300;
  return NextResponse.json({ logs: await appLogs(app.id, lines) });
});
