import "server-only";
import { nanoid } from "nanoid";
import Stripe from "stripe";
import { db } from "../db";
import { HttpError } from "../errors";
import { addActivity, upsertContact } from "./contacts";
import { emitEvent } from "./events";
import { getLocSetting, secretHint } from "./location-settings";

/**
 * Products and payments via each sub-account's own Stripe account.
 *
 * Payments are recorded two ways (whichever happens first; `orders.stripe_ref` makes it idempotent):
 *  1. The checkout success page confirms the Checkout Session with Stripe directly — works on a
 *     laptop without any public URL.
 *  2. The Stripe webhook (/api/webhooks/stripe/<locationId>) — needed for subscription renewals and
 *     payments where the buyer closes the tab before returning.
 */

export interface Product {
  id: string;
  location_id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year" | null;
  active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  product_id: string | null;
  product_name: string;
  amount_cents: number;
  currency: string;
  status: string;
  kind: string;
  created_at: string;
}

type Row = Record<string, unknown>;
const toProduct = (r: Row) => ({
  ...(r as unknown as Product),
  active: !!r.active,
});

// ───────── Stripe client ─────────

type StripeLike = Pick<Stripe, "products" | "prices" | "checkout" | "webhooks" | "accounts">;
const g = globalThis as unknown as {
  __caphubStripeOverride?: (key: string) => StripeLike;
};

/** Tests can replace the Stripe client. */
export function __setStripeFactory(f: ((key: string) => StripeLike) | undefined) {
  g.__caphubStripeOverride = f;
}

export function stripeFor(locationId: string): StripeLike | null {
  const key = getLocSetting(locationId, "stripe_secret_key");
  if (!key) return null;
  return g.__caphubStripeOverride
    ? g.__caphubStripeOverride(key)
    : (new Stripe(key, {
        maxNetworkRetries: 2,
        timeout: 30_000,
      }) as unknown as StripeLike);
}

export function stripeStatus(locationId: string) {
  const key = getLocSetting(locationId, "stripe_secret_key");
  return {
    connected: !!key,
    mode: key ? (key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test") : null,
    keyHint: secretHint(locationId, "stripe_secret_key"),
    webhookConfigured: !!getLocSetting(locationId, "stripe_webhook_secret"),
    accountName: getLocSetting(locationId, "stripe_account_name"),
  };
}

/** Validates a key by fetching the account; stores its display name. */
export async function connectStripe(locationId: string, secretKey: string) {
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) throw new HttpError(400, "That doesn't look like a Stripe secret key (sk_test_… or sk_live_…)");
  const client = g.__caphubStripeOverride ? g.__caphubStripeOverride(secretKey) : (new Stripe(secretKey) as unknown as StripeLike);
  let name = "";
  try {
    const acct = await client.accounts.retrieveCurrent();
    name = acct.settings?.dashboard?.display_name || acct.business_profile?.name || acct.email || acct.id;
  } catch (err) {
    throw new HttpError(400, `Stripe rejected that key: ${(err as Error).message}`);
  }
  return name;
}

// ───────── products ─────────

export function listProducts(locationId: string, opts: { activeOnly?: boolean } = {}): Product[] {
  return (
    db()
      .prepare(`SELECT * FROM products WHERE location_id = ? ${opts.activeOnly ? "AND active = 1" : ""} ORDER BY active DESC, created_at DESC`)
      .all(locationId) as Row[]
  ).map(toProduct);
}

export function getProduct(id: string): Product | null {
  const r = db().prepare("SELECT * FROM products WHERE id = ?").get(id) as Row | undefined;
  return r ? toProduct(r) : null;
}

export interface ProductInput {
  name: string;
  description?: string;
  priceCents: number;
  currency?: string;
  interval?: "month" | "year" | null;
  active?: boolean;
}

/** Creates/updates the Stripe product + price. Prices are immutable in Stripe, so a price change creates a new one. */
async function syncToStripe(p: Product) {
  const stripe = stripeFor(p.location_id);
  if (!stripe) {
    db().prepare("UPDATE products SET sync_error = ? WHERE id = ?").run("Connect Stripe to sell this product", p.id);
    return getProduct(p.id)!;
  }
  try {
    let stripeProductId = p.stripe_product_id;
    if (!stripeProductId) {
      const sp = await stripe.products.create({
        name: p.name,
        description: p.description || undefined,
        active: p.active,
        metadata: { caphub_product_id: p.id },
      });
      stripeProductId = sp.id;
    } else {
      await stripe.products.update(stripeProductId, {
        name: p.name,
        description: p.description || "",
        active: p.active,
      });
    }
    let priceId = p.stripe_price_id;
    let needsPrice = !priceId;
    if (priceId) {
      const cur = await stripe.prices.retrieve(priceId);
      const curInterval = cur.recurring?.interval ?? null;
      needsPrice = cur.unit_amount !== p.price_cents || cur.currency !== p.currency || curInterval !== p.interval;
      if (needsPrice) await stripe.prices.update(priceId, { active: false });
    }
    if (needsPrice) {
      const price = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: p.price_cents,
        currency: p.currency,
        ...(p.interval ? { recurring: { interval: p.interval } } : {}),
        metadata: { caphub_product_id: p.id },
      });
      priceId = price.id;
    }
    db().prepare("UPDATE products SET stripe_product_id = ?, stripe_price_id = ?, sync_error = NULL WHERE id = ?").run(stripeProductId, priceId, p.id);
  } catch (err) {
    db()
      .prepare("UPDATE products SET sync_error = ? WHERE id = ?")
      .run(`Stripe: ${(err as Error).message}`.slice(0, 300), p.id);
  }
  return getProduct(p.id)!;
}

function validate(input: Partial<ProductInput>) {
  if (input.priceCents !== undefined && (!Number.isInteger(input.priceCents) || input.priceCents < 50)) {
    throw new HttpError(400, "Price must be at least 0.50");
  }
  if (input.currency !== undefined && !/^[a-z]{3}$/.test(input.currency)) throw new HttpError(400, "Currency must be a 3-letter code like cad or usd");
}

export async function createProduct(locationId: string, input: ProductInput) {
  validate(input);
  const id = nanoid(12);
  db()
    .prepare("INSERT INTO products (id, location_id, name, description, price_cents, currency, interval, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      id,
      locationId,
      input.name.trim().slice(0, 120),
      (input.description ?? "").trim().slice(0, 2000),
      input.priceCents,
      (input.currency ?? "cad").toLowerCase(),
      input.interval ?? null,
      input.active === false ? 0 : 1,
    );
  return syncToStripe(getProduct(id)!);
}

export async function updateProduct(id: string, patch: Partial<ProductInput>) {
  validate(patch);
  const p = getProduct(id);
  if (!p) throw new HttpError(404, "Product not found");
  const next = {
    name: patch.name?.trim().slice(0, 120) ?? p.name,
    description: patch.description?.trim().slice(0, 2000) ?? p.description,
    price_cents: patch.priceCents ?? p.price_cents,
    currency: patch.currency?.toLowerCase() ?? p.currency,
    interval: patch.interval !== undefined ? patch.interval : p.interval,
    active: patch.active ?? p.active,
  };
  db()
    .prepare("UPDATE products SET name = ?, description = ?, price_cents = ?, currency = ?, interval = ?, active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next.name, next.description, next.price_cents, next.currency, next.interval, next.active ? 1 : 0, id);
  return syncToStripe(getProduct(id)!);
}

export async function resyncProduct(id: string) {
  const p = getProduct(id);
  if (!p) throw new HttpError(404, "Product not found");
  return syncToStripe(p);
}

/** Archives instead of deleting when orders reference it (keeps revenue history intact). */
export async function deleteProduct(id: string) {
  const p = getProduct(id);
  if (!p) return;
  const used = (db().prepare("SELECT COUNT(*) AS n FROM orders WHERE product_id = ?").get(id) as { n: number }).n;
  if (used) {
    await updateProduct(id, { active: false });
    return { archived: true };
  }
  const stripe = stripeFor(p.location_id);
  if (stripe && p.stripe_product_id) await stripe.products.update(p.stripe_product_id, { active: false }).catch(() => {});
  db().prepare("DELETE FROM products WHERE id = ?").run(id);
  return { archived: false };
}

// ───────── checkout ─────────

export async function createCheckout(
  product: Product,
  opts: {
    baseUrl: string;
    email?: string;
    returnUrl?: string;
    contactId?: string | null;
  },
) {
  if (!product.active) throw new HttpError(410, "This product is no longer available");
  const stripe = stripeFor(product.location_id);
  if (!stripe) throw new HttpError(503, "Payments aren't set up for this business yet");
  if (!product.stripe_price_id) {
    product = await syncToStripe(product);
    if (!product.stripe_price_id) throw new HttpError(503, product.sync_error ?? "This product isn't synced to Stripe yet");
  }
  const back = opts.returnUrl && /^https?:\/\//.test(opts.returnUrl) ? opts.returnUrl : `${opts.baseUrl}/pay/${product.id}`;
  const metadata = {
    caphub_location_id: product.location_id,
    caphub_product_id: product.id,
    caphub_contact_id: opts.contactId ?? "",
  };
  const session = await stripe.checkout.sessions.create({
    mode: product.interval ? "subscription" : "payment",
    line_items: [{ price: product.stripe_price_id, quantity: 1 }],
    success_url: `${opts.baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}&l=${encodeURIComponent(product.location_id)}${opts.returnUrl ? `&return=${encodeURIComponent(back)}` : ""}`,
    cancel_url: back,
    customer_email: opts.email || undefined,
    ...(product.interval
      ? { subscription_data: { metadata } }
      : {
          customer_creation: "always" as const,
          payment_intent_data: { metadata },
        }),
    phone_number_collection: { enabled: true },
    billing_address_collection: "auto",
    allow_promotion_codes: true,
    metadata,
  });
  return session.url!;
}

/** Records a completed Checkout Session (idempotent). Returns the order, or null if not paid yet. */
export function recordCheckoutSession(locationId: string, s: Stripe.Checkout.Session): Order | null {
  if (s.metadata?.caphub_location_id && s.metadata.caphub_location_id !== locationId) return null;
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const existing = db().prepare("SELECT id FROM orders WHERE stripe_ref = ?").get(s.id) as { id: string } | undefined;
  if (existing) return getOrder(existing.id);

  const product = s.metadata?.caphub_product_id ? getProduct(s.metadata.caphub_product_id) : null;
  if (product && product.location_id !== locationId) return null;
  const details = s.customer_details;
  const [first, ...rest] = (details?.name ?? "").trim().split(/\s+/);
  let contactId: string | null = null;
  if (details?.email) {
    const { contact } = upsertContact(locationId, {
      email: details.email,
      first_name: first ?? "",
      last_name: rest.join(" "),
      phone: details.phone ?? undefined,
      source: "payment",
      tags: ["customer"],
    });
    contactId = contact.id;
  }
  const id = nanoid(12);
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
  db()
    .prepare(
      `INSERT INTO orders (id, location_id, contact_id, product_id, product_name, amount_cents, currency, status, kind, stripe_ref, stripe_payment_intent)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    )
    .run(
      id,
      locationId,
      contactId,
      product?.id ?? null,
      product?.name ?? "Payment",
      s.amount_total ?? 0,
      s.currency ?? product?.currency ?? "cad",
      s.mode === "subscription" ? "subscription" : "one_time",
      s.id,
      pi,
    );
  const amount = formatMoney(s.amount_total ?? 0, s.currency ?? "cad");
  if (contactId) addActivity(locationId, contactId, "payment", `Paid ${amount} for ${product?.name ?? "a payment"}`, { orderId: id });
  emitEvent(locationId, {
    type: "payment_received",
    contactId,
    data: {
      orderId: id,
      productId: product?.id ?? null,
      amountCents: s.amount_total ?? 0,
      currency: s.currency ?? "cad",
    },
  });
  return getOrder(id);
}

/** Subscription renewals (webhook `invoice.paid` with billing_reason subscription_cycle). */
export function recordRenewal(locationId: string, inv: Stripe.Invoice) {
  if (db().prepare("SELECT 1 FROM orders WHERE stripe_ref = ?").get(inv.id)) return;
  const email = inv.customer_email;
  const productId =
    (inv.parent?.subscription_details?.metadata?.caphub_product_id as string | undefined) ?? (inv.lines?.data?.[0]?.metadata?.caphub_product_id as string | undefined);
  const product = productId ? getProduct(productId) : null;
  if (product && product.location_id !== locationId) return;
  const contactId = email
    ? upsertContact(locationId, {
        email,
        source: "payment",
        tags: ["customer"],
      }).contact.id
    : null;
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO orders (id, location_id, contact_id, product_id, product_name, amount_cents, currency, status, kind, stripe_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', 'renewal', ?)`,
    )
    .run(id, locationId, contactId, product?.id ?? null, product?.name ?? "Subscription renewal", inv.amount_paid, inv.currency, inv.id);
  if (contactId) addActivity(locationId, contactId, "payment", `Subscription renewed: ${formatMoney(inv.amount_paid, inv.currency)}`, { orderId: id });
  emitEvent(locationId, {
    type: "payment_received",
    contactId,
    data: {
      orderId: id,
      productId: product?.id ?? null,
      amountCents: inv.amount_paid,
      currency: inv.currency,
    },
  });
}

export function markRefunded(paymentIntentId: string) {
  db().prepare("UPDATE orders SET status = 'refunded' WHERE stripe_payment_intent = ?").run(paymentIntentId);
}

// ───────── orders ─────────

const ORDER_SELECT = `SELECT o.id, o.contact_id, TRIM(c.first_name || ' ' || c.last_name) AS contact_name, c.email AS contact_email,
  o.product_id, o.product_name, o.amount_cents, o.currency, o.status, o.kind, o.created_at
  FROM orders o LEFT JOIN contacts c ON c.id = o.contact_id`;

export function getOrder(id: string): Order | null {
  return (db().prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id) as Order | undefined) ?? null;
}

export function listOrders(locationId: string, opts: { contactId?: string; limit?: number } = {}): Order[] {
  const where = ["o.location_id = ?"];
  const args: unknown[] = [locationId];
  if (opts.contactId) {
    where.push("o.contact_id = ?");
    args.push(opts.contactId);
  }
  return db()
    .prepare(`${ORDER_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT ?`)
    .all(...args, opts.limit ?? 200) as Order[];
}

export function revenueStats(locationId: string) {
  const rows = db()
    .prepare(
      `SELECT currency, COALESCE(SUM(amount_cents) FILTER (WHERE created_at >= datetime('now', '-30 days')), 0) AS last30,
              COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS orders
       FROM orders WHERE location_id = ? AND status = 'paid' GROUP BY currency ORDER BY total DESC`,
    )
    .all(locationId) as {
    currency: string;
    last30: number;
    total: number;
    orders: number;
  }[];
  return rows;
}

export function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
