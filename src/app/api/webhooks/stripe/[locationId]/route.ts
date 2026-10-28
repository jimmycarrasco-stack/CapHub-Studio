import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getLocation } from "@/lib/auth";
import { getLocSetting } from "@/lib/crm/location-settings";
import { markRefunded, recordCheckoutSession, recordRenewal, stripeFor } from "@/lib/crm/payments";

/**
 * Stripe webhook for one sub-account. Add it in Stripe → Developers → Webhooks with events:
 * checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, charge.refunded.
 */
export async function POST(req: Request, ctx: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await ctx.params;
  if (!getLocation(locationId)) return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  const secret = getLocSetting(locationId, "stripe_webhook_secret");
  const stripe = stripeFor(locationId);
  if (!secret || !stripe) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      recordCheckoutSession(locationId, event.data.object);
      break;
    case "invoice.paid": {
      const inv = event.data.object;
      if (inv.billing_reason === "subscription_cycle") recordRenewal(locationId, inv);
      break;
    }
    case "charge.refunded": {
      const pi = event.data.object.payment_intent;
      if (pi) markRefunded(typeof pi === "string" ? pi : pi.id);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
