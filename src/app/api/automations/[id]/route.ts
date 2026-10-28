import { NextResponse } from "next/server";
import { z } from "zod";
import { automationFor } from "@/lib/guards";
import { deleteAutomation, getAutomation, listRuns, setAutomationEnabled, updateAutomation } from "@/lib/crm/automations";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: a } = await automationFor((await ctx.params).id);
  return NextResponse.json({ automation: a, runs: listRuns({ automationId: a.id, limit: 100 }) });
});

/** Full save from the builder. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { rec: a } = await automationFor((await ctx.params).id);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  return NextResponse.json(updateAutomation(a.id, raw));
});

/** On/off switch. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: a } = await automationFor((await ctx.params).id);
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  setAutomationEnabled(a.id, enabled);
  return NextResponse.json(getAutomation(a.id));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: a } = await automationFor((await ctx.params).id);
  deleteAutomation(a.id);
  return NextResponse.json({ ok: true });
});
