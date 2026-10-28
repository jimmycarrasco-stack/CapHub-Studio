import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle } from "@/lib/http";
import { listSnapshots, requireApp } from "@/lib/apps/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  return NextResponse.json(listSnapshots(app.id));
});
