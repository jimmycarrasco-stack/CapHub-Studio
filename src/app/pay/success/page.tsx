import { headers } from "next/headers";
import { getLocation } from "@/lib/auth";
import { formatMoney, recordCheckoutSession, stripeFor } from "@/lib/crm/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment received", robots: { index: false } };

/**
 * Stripe redirects here after checkout. We confirm the session with Stripe directly (so payments
 * are recorded even without a webhook), then thank the buyer or continue to the next funnel step.
 */
export default async function PaySuccess({ searchParams }: { searchParams: Promise<{ session_id?: string; l?: string; return?: string }> }) {
  const sp = await searchParams;
  const loc = sp.l ? getLocation(sp.l) : null;
  const stripe = loc ? stripeFor(loc.id) : null;
  let message = "Thank you! Your payment was received.";
  let amount: string | null = null;
  let ok = false;

  if (stripe && loc && sp.session_id && /^cs_[A-Za-z0-9_]+$/.test(sp.session_id)) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sp.session_id);
      const order = recordCheckoutSession(loc.id, session);
      if (order) {
        ok = true;
        amount = formatMoney(order.amount_cents, order.currency);
      } else message = "Your payment is processing. You'll get a confirmation email from Stripe shortly.";
    } catch {
      message = "We couldn't confirm the payment yet. If you were charged, you'll receive a receipt from Stripe.";
    }
  }

  // Funnels: continue to the next step (only same-site URLs).
  const h = await headers();
  const origin = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const next = ok && sp.return && sp.return.startsWith(`${origin}/f/`) ? sp.return : null;

  return (
    <main className="grid min-h-full place-items-center bg-zinc-50 p-6">
      {next && <meta httpEquiv="refresh" content={`2;url=${next}`} />}
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-200">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">{ok ? "Payment received" : "Thanks!"}</h1>
        <p className="mt-2 text-sm text-zinc-600">{amount ? `${message} (${amount})` : message}</p>
        {loc && <p className="mt-4 text-sm text-zinc-500">— {loc.name}</p>}
        {next && (
          <a href={next} className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
            Continue
          </a>
        )}
      </div>
    </main>
  );
}
