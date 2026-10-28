import { NextResponse } from "next/server";
import { z } from "zod";
import { opportunityFor } from "@/lib/guards";
import { getContact } from "@/lib/crm/contacts";
import { deleteOpportunity, updateOpportunity } from "@/lib/crm/pipelines";
import { handle, HttpError, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: o, ctx: access } = await opportunityFor((await ctx.params).id);
  const body = await parseBody(
    req,
    z.object({
      stageId: z.string().max(40).optional(),
      position: z.number().finite().optional(),
      title: z.string().trim().min(1).max(200).optional(),
      valueCents: z.number().int().min(0).max(1e12).optional(),
      status: z.enum(["open", "won", "lost"]).optional(),
      contactId: z.string().max(40).nullable().optional(),
    }),
  );
  if (body.contactId && getContact(body.contactId)?.location_id !== o.location_id) throw new HttpError(404, "Contact not found");
  return NextResponse.json(updateOpportunity(o.id, body, { userId: access.user.id }));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: o } = await opportunityFor((await ctx.params).id);
  deleteOpportunity(o.id);
  return NextResponse.json({ ok: true });
});
