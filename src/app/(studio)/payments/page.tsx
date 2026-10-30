import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatMoney, listOrders, listProducts, revenueStats, stripeStatus } from "@/lib/crm/payments";
import { timeAgo } from "@/lib/format";
import { pageCtx } from "@/lib/page-ctx";
import { Products } from "./products";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const ctx = await pageCtx();
  const loc = ctx.location.id;
  const stripe = stripeStatus(loc);
  const orders = listOrders(loc, { limit: 200 });
  const revenue = revenueStats(loc);

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Payments" subtitle="Sell products and subscriptions with Stripe — share a payment link or add a checkout button to any site." />

      {!stripe.connected ? (
        <Link href="/settings#stripe" className="mb-6 block rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
          <strong className="font-semibold">Connect Stripe to take payments.</strong> You can create products now; they sync to Stripe once it&apos;s connected →
        </Link>
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <Badge tone="green">Stripe connected</Badge>
          <span>{stripe.accountName}</span>
          {stripe.mode === "test" && <Badge tone="amber">Test mode</Badge>}
          {!stripe.webhookConfigured && (
            <Link href="/settings#stripe" className="text-xs text-amber-700 hover:underline">
              Add the webhook so subscription renewals and refunds are recorded →
            </Link>
          )}
        </div>
      )}

      {revenue.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {revenue.slice(0, 2).flatMap((r) => [
            <div key={`${r.currency}-30`} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="text-xs font-medium text-zinc-500">Last 30 days ({r.currency.toUpperCase()})</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(r.last30, r.currency)}</div>
            </div>,
            <div key={`${r.currency}-all`} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="text-xs font-medium text-zinc-500">All time ({r.currency.toUpperCase()})</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(r.total, r.currency)}</div>
              <div className="text-xs text-zinc-400">
                {r.orders} payment{r.orders === 1 ? "" : "s"}
              </div>
            </div>,
          ])}
        </div>
      )}

      <Products initial={listProducts(loc)} stripeConnected={stripe.connected} isAgencyAdmin={ctx.isAgencyAdmin} />

      <h2 className="mt-10 mb-3 text-sm font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <EmptyState title="No payments yet">When someone pays through a payment link or a checkout button on your site, it shows up here and on their contact.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5">
                    {o.contact_id ? (
                      <Link href={`/contacts/${o.contact_id}`} className="font-medium hover:text-brand-700">
                        {o.contact_name || o.contact_email || "Contact"}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{o.product_name || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{o.kind === "renewal" ? "Renewal" : o.kind === "subscription" ? "Subscription" : "One-time"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(o.amount_cents, o.currency)} {o.status !== "paid" && <Badge tone="amber">{o.status}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap text-zinc-400">{timeAgo(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
