import { NextResponse } from "next/server";
import { z } from "zod";
import { contactFor } from "@/lib/guards";
import { mergeVars, renderTemplate, sendEmail } from "@/lib/crm/email";
import { handle, HttpError, parseBody } from "@/lib/http";

/** Sends a one-off email to the contact from the sub-account's SMTP. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { rec: c, ctx: access } = await contactFor((await ctx.params).id);
  if (!c.email) throw new HttpError(400, "This contact has no email address");
  const { subject, body, attachments } = await parseBody(
    req,
    z.object({ subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(20_000), attachments: z.array(z.string().max(40)).max(10).optional() }),
  );
  const vars = mergeVars(c.id, { business: { name: access.location.name } });
  const r = await sendEmail(c.location_id, { to: c.email, subject: renderTemplate(subject, vars), body: renderTemplate(body, vars), contactId: c.id, userId: access.user.id, attachments });
  if (!r.ok) throw new HttpError(502, r.error ?? "Email failed");
  return NextResponse.json({ ok: true });
});
