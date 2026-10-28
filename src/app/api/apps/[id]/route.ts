import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, parseBody, requireAdmin } from "@/lib/http";
import { isRunning } from "@/lib/apps/jobs";
import { listAppMessages, requireApp, updateApp } from "@/lib/apps/repo";
import { deleteApp } from "@/lib/apps/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  return NextResponse.json({ ...app, messages: listAppMessages(app.id), working: isRunning(app.id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireAdmin();
  const app = requireApp((await ctx.params).id);
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return NextResponse.json(updateApp(app.id, body));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  requireApp(id);
  if (isRunning(id)) throw new HttpError(409, "Stop the AI before deleting this app");
  await deleteApp(id);
  return NextResponse.json({ ok: true });
});
