import { NextResponse } from "next/server";
import { appFor } from "@/lib/guards";
import { handle, HttpError } from "@/lib/http";
import { isRunning } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";
import { stopApp } from "@/lib/apps/runtime";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { app } = await appFor((await ctx.params).id);
  if (isRunning(app.id)) throw new HttpError(409, "Stop the AI before stopping the app");
  await stopApp(app.id);
  return NextResponse.json({ ok: true });
});
