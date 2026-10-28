import { NextResponse } from "next/server";
import { z } from "zod";
import { automationFor, contactFor } from "@/lib/guards";
import { enrollManually } from "@/lib/crm/automations";
import { handle, HttpError, parseBody } from "@/lib/http";

/** Puts a contact through an automation right now. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { rec: c } = await contactFor((await ctx.params).id);
  const { automationId } = await parseBody(req, z.object({ automationId: z.string().max(40) }));
  const { rec: a } = await automationFor(automationId);
  if (a.location_id !== c.location_id) throw new HttpError(404, "Automation not found");
  return NextResponse.json({ runId: enrollManually(a, c.id) }, { status: 201 });
});
