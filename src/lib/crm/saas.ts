import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { createLocation, createUser, getLocation, getUserByEmail, setLocationStatus, setMembership, type Location } from "../auth";
import { db } from "../db";
import { createPasswordToken } from "../password-tokens";
import { addActivity } from "./contacts";
import { sendEmail } from "./email";
import { getProduct, type Order } from "./payments";
import { createPipeline } from "./pipelines";

/**
 * SaaS mode: when a buyer pays for a product marked "creates a sub-account", create their
 * sub-account and login automatically and email them a link to set their password.
 *
 * Runs from both the checkout success page and the Stripe webhook; the unique
 * locations.source_order_id makes it happen exactly once per order.
 */

export interface ProvisionResult {
  location: Location;
  created: boolean;
  newUser: boolean;
  emailed: boolean;
  setPasswordUrl: string | null;
  error?: string;
}

function businessNameFrom(s: Stripe.Checkout.Session, fallback: string) {
  const f = s.custom_fields?.find((x) => x.key === "business_name");
  const v = f?.text?.value?.trim();
  return (v || fallback).slice(0, 100);
}

export function locationForOrder(orderId: string): Location | null {
  const r = db().prepare("SELECT id FROM locations WHERE source_order_id = ?").get(orderId) as { id: string } | undefined;
  return r ? getLocation(r.id) : null;
}

/**
 * Creates the buyer's sub-account for a paid order if its product is a SaaS product. Safe to call
 * repeatedly. `baseUrl` is the public URL used in the welcome email's link.
 */
export async function provisionFromOrder(order: Order | null, session: Stripe.Checkout.Session, baseUrl: string): Promise<ProvisionResult | null> {
  if (!order?.product_id) return null;
  const product = getProduct(order.product_id);
  if (!product?.provisions_subaccount) return null;

  const existing = locationForOrder(order.id);
  if (existing) return { location: existing, created: false, newUser: false, emailed: false, setPasswordUrl: null };

  const email = (session.customer_details?.email ?? order.contact_email ?? "").trim().toLowerCase();
  if (!email) return null;
  const buyerName = (session.customer_details?.name ?? order.contact_name ?? "").trim() || email.split("@")[0];
  const seller = getLocation(order.location_id);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);

  // Synchronous block: no await between the existence check and the insert, so two concurrent
  // callers in this (single) server process can't both create it.
  let location: Location;
  try {
    location = createLocation({
      name: businessNameFrom(session, `${buyerName.split(" ")[0]}'s business`),
      email,
      phone: session.customer_details?.phone ?? "",
      timezone: seller?.timezone,
    });
    db()
      .prepare("UPDATE locations SET source_order_id = ?, billing_location_id = ?, stripe_subscription_id = ? WHERE id = ?")
      .run(order.id, order.location_id, subscriptionId, location.id);
  } catch (err) {
    const again = locationForOrder(order.id);
    if (again) return { location: again, created: false, newUser: false, emailed: false, setPasswordUrl: null };
    throw err;
  }
  createPipeline(location.id, "Sales pipeline");

  let user = getUserByEmail(email);
  const newUser = !user;
  if (!user) {
    // Random unguessable password; the buyer sets their own through the emailed link.
    user = await createUser({ email, name: buyerName, password: randomBytes(24).toString("base64url") });
  }
  setMembership(user.id, location.id, "admin");
  location = getLocation(location.id)!;

  const setPasswordUrl = newUser ? `${baseUrl}/set-password?token=${createPasswordToken(user.id, 7)}` : null;
  const body = newUser
    ? `Hi ${buyerName.split(" ")[0]},\n\nThanks for your purchase! Your **${location.name}** account is ready.\n\nClick below to choose your password and sign in:\n\n[[Set your password|${setPasswordUrl}]]\n\nThis link works once and expires in 7 days. After that, sign in at ${baseUrl}/login with ${email}.\n\n${seller?.name ?? ""}`
    : `Hi ${buyerName.split(" ")[0]},\n\nThanks for your purchase! **${location.name}** has been added to your account.\n\n[[Sign in|${baseUrl}/login]]\n\nUse your existing login (${email}).\n\n${seller?.name ?? ""}`;
  const mail = await sendEmail(order.location_id, {
    to: email,
    subject: newUser ? `Your ${location.name} account is ready` : `${location.name} has been added to your account`,
    body,
    contactId: order.contact_id,
    skipDnd: true, // transactional: they just bought it
  });
  if (order.contact_id) {
    addActivity(
      order.location_id,
      order.contact_id,
      "saas",
      `Sub-account “${location.name}” created from purchase${mail.ok ? " — welcome email sent" : ` — welcome email failed (${mail.error}); send them a login link from Agency`}`,
      { locationId: location.id, orderId: order.id },
    );
  }
  return { location, created: true, newUser, emailed: mail.ok, setPasswordUrl, error: mail.ok ? undefined : mail.error };
}

/** Webhook: suspend or reactivate the sub-accounts billed by a subscription. */
export function syncSubscriptionStatus(billingLocationId: string, subscriptionId: string, stripeStatus: string) {
  const rows = db()
    .prepare("SELECT id, status FROM locations WHERE billing_location_id = ? AND stripe_subscription_id = ?")
    .all(billingLocationId, subscriptionId) as { id: string; status: string }[];
  const next = ["active", "trialing"].includes(stripeStatus) ? "active" : ["canceled", "unpaid", "incomplete_expired"].includes(stripeStatus) ? "suspended" : null;
  if (!next) return 0; // past_due etc.: leave as is while Stripe retries
  for (const r of rows) if (r.status !== next) setLocationStatus(r.id, next);
  return rows.length;
}

