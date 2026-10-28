import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/http";
import { listSnapshots, requireApp } from "@/lib/apps/repo";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  return NextResponse.json(listSnapshots(app.id));
});
