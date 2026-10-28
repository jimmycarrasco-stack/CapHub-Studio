import { NextResponse } from "next/server";
import { contactFor } from "@/lib/guards";
import { listRuns } from "@/lib/crm/automations";
import { deleteContact, listActivities, listTasks, updateContact } from "@/lib/crm/contacts";
import { listMessages } from "@/lib/crm/email";
import { listOrders } from "@/lib/crm/payments";
import { listContactOpportunities } from "@/lib/crm/pipelines";
import { handle, parseBody } from "@/lib/http";
import { contactInputSchema } from "@/lib/crm/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Everything about one contact, for the contact page. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: c } = await contactFor((await ctx.params).id);
  return NextResponse.json({
    contact: c,
    activities: listActivities(c.id),
    tasks: listTasks(c.location_id, { contactId: c.id }),
    opportunities: listContactOpportunities(c.id),
    orders: listOrders(c.location_id, { contactId: c.id }),
    messages: listMessages(c.location_id, { contactId: c.id, limit: 50 }),
    runs: listRuns({ contactId: c.id, limit: 20 }),
  });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { rec: c, ctx: access } = await contactFor((await ctx.params).id);
  const body = await parseBody(req, contactInputSchema);
  return NextResponse.json(updateContact(c.id, { ...body, email: body.email === "" ? null : body.email }, { userId: access.user.id }));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { rec: c } = await contactFor((await ctx.params).id);
  deleteContact(c.id);
  return NextResponse.json({ ok: true });
});
