import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { deleteTask, getTask, updateTask } from "@/lib/crm/contacts";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const t = getTask((await ctx.params).id);
  if (!t) throw new HttpError(404, "Task not found");
  await requireAccess(t.location_id);
  return t;
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const t = await load(ctx);
  updateTask(t.id as string, await parseBody(req, z.object({ title: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional(), dueAt: z.string().nullable().optional() })));
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const t = await load(ctx);
  deleteTask(t.id as string);
  return NextResponse.json({ ok: true });
});
