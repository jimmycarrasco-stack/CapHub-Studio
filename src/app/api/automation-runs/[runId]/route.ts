import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelRun } from "@/lib/crm/automations";
import { handle, HttpError } from "@/lib/http";

/** Cancel a waiting run. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const id = Number((await ctx.params).runId);
  const r = db().prepare("SELECT location_id FROM automation_runs WHERE id = ?").get(id) as { location_id: string } | undefined;
  if (!r) throw new HttpError(404, "Run not found");
  await requireAccess(r.location_id);
  cancelRun(id);
  return NextResponse.json({ ok: true });
});
