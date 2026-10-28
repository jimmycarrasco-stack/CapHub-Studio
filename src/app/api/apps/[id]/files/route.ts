import { NextResponse } from "next/server";
import { z } from "zod";
import { appFor } from "@/lib/guards";
import { handle, HttpError, parseBody } from "@/lib/http";
import { deletePath, listTree, readFile, writeFile } from "@/lib/apps/workspace";
import { isRunning } from "@/lib/apps/jobs";
import { requireApp } from "@/lib/apps/repo";
import { takeSnapshot } from "@/lib/apps/service";

type Ctx = { params: Promise<{ id: string }> };

/** No `path` → file tree. With `path` → file content. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { app } = await appFor((await ctx.params).id);
  const p = new URL(req.url).searchParams.get("path");
  if (!p) return NextResponse.json(await listTree(app.id));
  return NextResponse.json({ path: p, content: await readFile(app.id, p) });
});

/** Manual edit from the code editor. Saved as a version. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { app } = await appFor((await ctx.params).id);
  if (isRunning(app.id)) throw new HttpError(409, "The AI is editing this app right now — wait for it to finish");
  const { path, content } = await parseBody(req, z.object({ path: z.string().min(1).max(500), content: z.string().max(1_000_000) }));
  await writeFile(app.id, path, content);
  await takeSnapshot(app.id, `Manual edit: ${path}`);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { app } = await appFor((await ctx.params).id);
  if (isRunning(app.id)) throw new HttpError(409, "The AI is editing this app right now — wait for it to finish");
  const p = new URL(req.url).searchParams.get("path");
  if (!p) throw new HttpError(400, "path is required");
  await deletePath(app.id, p);
  await takeSnapshot(app.id, `Deleted ${p}`);
  return NextResponse.json({ ok: true });
});
