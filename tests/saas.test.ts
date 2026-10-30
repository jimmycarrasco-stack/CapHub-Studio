import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

async function setup() {
  vi.resetModules();
  (globalThis as { __caphubDb?: unknown }).__caphubDb = undefined;
  (globalThis as { __caphubEventHandlers?: unknown }).__caphubEventHandlers = undefined;
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "caphub-saas-")), "t.db");
  process.env.APP_SECRET = "s".repeat(40);
  const auth = await import("@/lib/auth");
  const payments = await import("@/lib/crm/payments");
  const saas = await import("@/lib/crm/saas");
  const tokens = await import("@/lib/password-tokens");
  const { db } = await import("@/lib/db");
  const seller = auth.createLocation({ name: "CapHub Agency" });
  // Insert the product directly (no Stripe in tests).
  db().prepare("INSERT INTO products (id, location_id, name, price_cents, currency, interval, provisions_subaccount) VALUES ('prod1', ?, 'CRM Pro', 9700, 'cad', 'month', 1)").run(seller.id);
  db().prepare("INSERT INTO products (id, location_id, name, price_cents, currency) VALUES ('prod2', ?, 'Coaching', 5000, 'cad')").run(seller.id);
  return { auth, payments, saas, tokens, db, seller };
}

const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_" + Math.random().toString(36).slice(2),
    mode: "subscription",
    payment_status: "paid",
    amount_total: 9700,
    currency: "cad",
    subscription: "sub_123",
    metadata: { caphub_product_id: "prod1" },
    customer_details: { email: "Owner@Buyer.test", name: "Pat Buyer", phone: "204-555-0100" },
    custom_fields: [{ key: "business_name", text: { value: "Buyer Plumbing" } }],
    ...over,
  }) as unknown as Stripe.Checkout.Session;

describe("SaaS mode", () => {
  it("creates the buyer's sub-account and login once per order", async () => {
    const { auth, payments, saas, tokens, seller } = await setup();
    const s = session();
    const order = payments.recordCheckoutSession(seller.id, s);
    const r = await saas.provisionFromOrder(order, s, "https://studio.test");
    expect(r?.created).toBe(true);
    expect(r?.newUser).toBe(true);
    expect(r?.location.name).toBe("Buyer Plumbing");
    expect(r?.emailed).toBe(false); // no SMTP in tests — reported, not thrown
    const user = auth.getUserByEmail("owner@buyer.test")!;
    expect(auth.roleIn(user, r!.location.id)).toBe("admin");
    expect(auth.roleIn(user, seller.id)).toBeNull();
    const token = r!.setPasswordUrl!.split("token=")[1];
    expect(tokens.checkPasswordToken(token)).toBe(user.id);
    expect(tokens.consumePasswordToken(token)).toBe(user.id);
    expect(() => tokens.consumePasswordToken(token)).toThrow(/invalid or has expired/); // one use

    // Success page + webhook both call it: still one sub-account.
    const again = await saas.provisionFromOrder(payments.recordCheckoutSession(seller.id, s), s, "https://studio.test");
    expect(again?.created).toBe(false);
    expect(auth.listAllLocations()).toHaveLength(2);
  });

  it("ignores normal products and adds existing users without a new password", async () => {
    const { auth, payments, saas, seller } = await setup();
    const plain = session({ metadata: { caphub_product_id: "prod2" }, mode: "payment", subscription: null });
    expect(await saas.provisionFromOrder(payments.recordCheckoutSession(seller.id, plain), plain, "https://x.test")).toBeNull();
    await auth.createUser({ email: "owner@buyer.test", name: "Pat", password: "x".repeat(12) });
    const s = session();
    const r = await saas.provisionFromOrder(payments.recordCheckoutSession(seller.id, s), s, "https://x.test");
    expect(r?.newUser).toBe(false);
    expect(r?.setPasswordUrl).toBeNull();
  });

  it("suspends on cancellation and reactivates on payment", async () => {
    const { auth, payments, saas, seller } = await setup();
    const s = session();
    const r = (await saas.provisionFromOrder(payments.recordCheckoutSession(seller.id, s), s, "https://x.test"))!;
    const user = auth.getUserByEmail("owner@buyer.test")!;
    expect(saas.syncSubscriptionStatus(seller.id, "sub_123", "past_due")).toBe(0); // grace while Stripe retries
    saas.syncSubscriptionStatus(seller.id, "sub_123", "canceled");
    expect(auth.getLocation(r.location.id)!.status).toBe("suspended");
    expect(auth.listUserLocations(user)).toHaveLength(0);
    expect(auth.roleIn(user, r.location.id)).toBeNull();
    saas.syncSubscriptionStatus("other-seller", "sub_123", "active"); // other sub-account's webhook can't touch it
    expect(auth.getLocation(r.location.id)!.status).toBe("suspended");
    saas.syncSubscriptionStatus(seller.id, "sub_123", "active");
    expect(auth.roleIn(user, r.location.id)).toBe("admin");
  });
});
