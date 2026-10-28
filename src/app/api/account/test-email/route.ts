import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { sendEmail } from "@/lib/crm/email";
import { handle, HttpError } from "@/lib/http";

/** Sends a test email to the signed-in user. */
export const POST = handle(async () => {
  const { location, user } = await requireCtx("admin");
  const r = await sendEmail(location.id, {
    to: user.email,
    subject: `Test email from ${location.name}`,
    body: `Hi ${user.name},\n\nYour email settings in CapHub Studio work. Automations and one-off emails will be sent from this address.`,
    skipDnd: true,
  });
  if (!r.ok) throw new HttpError(502, r.error ?? "Email failed");
  return NextResponse.json({ ok: true, to: user.email });
});
