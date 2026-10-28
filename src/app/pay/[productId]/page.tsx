import { notFound } from "next/navigation";
import { getLocation } from "@/lib/auth";
import { formatMoney, getProduct, stripeStatus } from "@/lib/crm/payments";
import { BuyButton } from "./buy-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }) {
  const p = getProduct((await params).productId);
  return { title: p ? p.name : "Checkout", robots: { index: false } };
}

/** Public payment link page for a product. */
export default async function PayPage({ params }: { params: Promise<{ productId: string }> }) {
  const product = getProduct((await params).productId);
  if (!product || !product.active) notFound();
  const business = getLocation(product.location_id);
  const ready = stripeStatus(product.location_id).connected && !product.sync_error;

  return (
    <main className="grid min-h-full place-items-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-medium text-zinc-500">{business?.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{product.name}</h1>
        {product.description && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-600">{product.description}</p>}
        <p className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900">
          {formatMoney(product.price_cents, product.currency)}
          {product.interval && <span className="text-base font-normal text-zinc-500"> / {product.interval}</span>}
        </p>
        {ready ? (
          <BuyButton productId={product.id} />
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Online payments aren&apos;t available yet. Please contact {business?.name ?? "the business"}.</p>
        )}
        <p className="mt-4 text-center text-xs text-zinc-400">Secure checkout by Stripe</p>
      </div>
    </main>
  );
}
