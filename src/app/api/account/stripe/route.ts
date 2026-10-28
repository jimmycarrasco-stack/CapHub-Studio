import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { setLocSetting } from "@/lib/crm/location-settings";
import { connectStripe, stripeStatus } from "@/lib/crm/payments";
import { baseUrl, handle, parseBody } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  return NextResponse.json({ ...stripeStatus(location.id), webhookUrl: `${baseUrl(req)}/api/webhooks/stripe/${location.id}` });
});

/** Connect (validates the key with Stripe) and/or save the webhook signing secret. */
export const PUT = handle(async (req: Request) => {
  const { location } = await requireCtx("admin");
  const body = await parseBody(
    req,
    z.object({
      secretKey: z.string().trim().max(300).optional(),
      webhookSecret: z
        .string()
        .trim()
        .max(300)
        .refine((v) => v === "" || v.startsWith("whsec_"), "Webhook signing secrets start with whsec_")
        .optional(),
    }),
  );
  if (body.secretKey) {
    const name = await connectStripe(location.id, body.secretKey);
    setLocSetting(location.id, "stripe_secret_key", body.secretKey);
    setLocSetting(location.id, "stripe_account_name", name);
  }
  if (body.webhookSecret !== undefined) setLocSetting(location.id, "stripe_webhook_secret", body.webhookSecret || null);
  return NextResponse.json({ ...stripeStatus(location.id), webhookUrl: `${baseUrl(req)}/api/webhooks/stripe/${location.id}` });
});

/** Disconnect Stripe from this sub-account (products and orders are kept). */
export const DELETE = handle(async () => {
  const { location } = await requireCtx("admin");
  for (const k of ["stripe_secret_key", "stripe_webhook_secret", "stripe_account_name"]) setLocSetting(location.id, k, null);
  return NextResponse.json(stripeStatus(location.id));
});
