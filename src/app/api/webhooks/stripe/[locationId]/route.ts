import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getLocation } from "@/lib/auth";
import { getLocSetting } from "@/lib/crm/location-settings";
import { markRefunded, recordCheckoutSession, recordRenewal, stripeFor } from "@/lib/crm/payments";
import { provisionFromOrder, syncSubscriptionStatus } from "@/lib/crm/saas";
import { baseUrl } from "@/lib/http";

/**
 * Stripe webhook for one sub-account. Add it in Stripe → Developers → Webhooks with events:
 * checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, charge.refunded,
 * customer.subscription.updated, customer.subscription.deleted (the last two suspend/reactivate SaaS sub-accounts).
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
    case "checkout.session.async_payment_succeeded": {
      const order = recordCheckoutSession(locationId, event.data.object);
      try {
        await provisionFromOrder(order, event.data.object, baseUrl(req));
      } catch (err) {
        console.error("SaaS provisioning failed", err);
      }
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object;
      if (inv.billing_reason === "subscription_cycle") recordRenewal(locationId, inv);
      const sub = (inv as unknown as { subscription?: string | { id: string } | null }).subscription ?? inv.parent?.subscription_details?.subscription;
      if (sub) syncSubscriptionStatus(locationId, typeof sub === "string" ? sub : sub.id, "active");
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      syncSubscriptionStatus(locationId, sub.id, event.type === "customer.subscription.deleted" ? "canceled" : sub.status);
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
