import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { getContact } from "@/lib/crm/contacts";
import { createOpportunity } from "@/lib/crm/pipelines";
import { handle, HttpError, parseBody } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const { location, user } = await requireCtx();
  const body = await parseBody(
    req,
    z.object({
      pipelineId: z.string().max(40),
      stageId: z.string().max(40).optional(),
      title: z.string().trim().min(1).max(200),
      valueCents: z.number().int().min(0).max(1e12).optional(),
      contactId: z.string().max(40).nullable().optional(),
    }),
  );
  if (body.contactId && getContact(body.contactId)?.location_id !== location.id) throw new HttpError(404, "Contact not found");
  return NextResponse.json(createOpportunity(location.id, body, { userId: user.id }), { status: 201 });
});
