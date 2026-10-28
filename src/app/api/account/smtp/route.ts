import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { setLocSetting } from "@/lib/crm/location-settings";
import { smtpStatus, verifySmtp } from "@/lib/crm/email";
import { handle, HttpError, parseBody } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx("admin");
  return NextResponse.json(smtpStatus(location.id));
});

/** Saves SMTP settings, then checks they work. A blank password keeps the saved one. */
export const PUT = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  const b = await parseBody(
    req,
    z.object({
      host: z.string().trim().min(1).max(200),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().trim().max(200),
      pass: z.string().max(500).optional(),
      fromName: z.string().trim().max(100),
      fromEmail: z.string().trim().email("Enter the email address messages come from").max(200),
    }),
  );
  const set = (k: string, v: string) => setLocSetting(location.id, k, v);
  set("smtp_host", b.host);
  set("smtp_port", String(b.port));
  set("smtp_secure", b.secure ? "1" : "0");
  set("smtp_user", b.user);
  if (b.pass) set("smtp_pass", b.pass);
  set("smtp_from_name", b.fromName);
  set("smtp_from_email", b.fromEmail);
  try {
    await verifySmtp(location.id);
  } catch (err) {
    throw new HttpError(400, `Saved, but the mail server didn't accept the connection: ${(err as Error).message}`);
  }
  return NextResponse.json(smtpStatus(location.id));
});

export const DELETE = handle(async () => {
  const { location } = await requireCtx("admin");
  for (const k of ["smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from_name", "smtp_from_email"]) setLocSetting(location.id, k, null);
  return NextResponse.json(smtpStatus(location.id));
});
