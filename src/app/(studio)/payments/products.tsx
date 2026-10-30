"use client";

import { useState } from "react";
import { api, Badge, Button, Field, Input, Modal, money, Select, Textarea, toast, toCents, Toggle } from "@/components/ui";
import type { Product } from "@/lib/crm/payments";

export function Products({ initial, stripeConnected, isAgencyAdmin }: { initial: Product[]; stripeConnected: boolean; isAgencyAdmin: boolean }) {
  const [products, setProducts] = useState(initial);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const upsert = (p: Product) => setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));

  async function copyLink(p: Product) {
    const url = `${window.location.origin}/pay/${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Payment link copied", "success");
    } catch {
      toast(url);
    }
  }

  async function resync(p: Product) {
    try {
      upsert(await api<Product>(`/api/products/${p.id}`, { method: "POST" }));
      toast("Synced to Stripe", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Products</h2>
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
          New product
        </Button>
      </div>
      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500">
          No products yet. Add what you sell — a service, a package, a course, a monthly membership.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{p.name}</h3>
                {!p.active ? <Badge>Inactive</Badge> : p.stripe_price_id ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Not synced</Badge>}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {money(p.price_cents, p.currency)}
                {p.interval && <span className="text-sm font-normal text-zinc-500">/{p.interval}</span>}
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{p.description}</p>}
              {p.provisions_subaccount && (
                <p className="mt-2">
                  <Badge tone="brand">Creates a sub-account</Badge>
                </p>
              )}
              {p.sync_error && <p className="mt-2 text-xs text-red-600">Stripe: {p.sync_error}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                <Button size="sm" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                {p.active && (
                  <Button size="sm" onClick={() => copyLink(p)} disabled={!p.stripe_price_id} title={p.stripe_price_id ? undefined : "Sync to Stripe first"}>
                    Copy payment link
                  </Button>
                )}
                {stripeConnected && !p.stripe_price_id && (
                  <Button size="sm" onClick={() => resync(p)}>
                    Sync now
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Tip: when you build a site, ask for a &ldquo;Buy now&rdquo; button for a product — the AI wires it to Stripe checkout automatically.
      </p>
      {editing && (
        <ProductModal
          isAgencyAdmin={isAgencyAdmin}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p, removed) => {
            if (removed) setProducts((prev) => prev.filter((x) => x.id !== p.id));
            else upsert(p);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function ProductModal({
  product,
  isAgencyAdmin,
  onClose,
  onSaved,
}: {
  product: Product | null;
  isAgencyAdmin: boolean;
  onClose: () => void;
  onSaved: (p: Product, removed?: boolean) => void;
}) {
  const [saas, setSaas] = useState(product?.provisions_subaccount ?? false);
  const [f, setF] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? (product.price_cents / 100).toFixed(2) : "",
    currency: product?.currency ?? "cad",
    interval: (product?.interval ?? "") as "" | "month" | "year",
    active: product?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const cents = toCents(f.price);

  async function save() {
    if (cents === null || cents < 50) return toast("Price must be at least 0.50", "error");
    setBusy(true);
    try {
      const json = { name: f.name, description: f.description, priceCents: cents, currency: f.currency, interval: f.interval || null, active: f.active };
      let p = product ? await api<Product>(`/api/products/${product.id}`, { method: "PATCH", json }) : await api<Product>("/api/products", { method: "POST", json });
      if (isAgencyAdmin && saas !== p.provisions_subaccount) p = await api<Product>(`/api/products/${p.id}/saas`, { method: "PUT", json: { enabled: saas } });
      if (p.sync_error) toast(`Saved, but Stripe sync failed: ${p.sync_error}`, "error");
      onSaved(p);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function remove() {
    if (!product) return;
    try {
      const r = await api<{ archived?: boolean }>(`/api/products/${product.id}`, { method: "DELETE" });
      if (r.archived) {
        toast("This product has orders, so it was deactivated instead of deleted", "info");
        onSaved({ ...product, active: false });
      } else onSaved(product, true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Modal open onClose={onClose} title={product ? "Edit product" : "New product"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" htmlFor="pn">
          <Input id="pn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="e.g. Strategy session" />
        </Field>
        <Field label="Description" hint="Shown on the checkout page" htmlFor="pd">
          <Textarea id="pd" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Price" htmlFor="pp">
            <Input id="pp" inputMode="decimal" placeholder="0.00" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="pc">
            <Select id="pc" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} disabled={!!product}>
              {["cad", "usd", "eur", "gbp", "aud", "nzd"].map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billing" htmlFor="pi">
            <Select id="pi" value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value as typeof f.interval })} disabled={!!product}>
              <option value="">One-time</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </Select>
          </Field>
        </div>
        {product && <p className="text-xs text-zinc-500">Changing the price creates a new Stripe price; existing subscribers keep their current price.</p>}
        {isAgencyAdmin && (
          <label className="flex items-start justify-between gap-3 rounded-lg bg-brand-50/60 p-3 text-sm ring-1 ring-brand-100">
            <span>
              <span className="font-medium">Creates a sub-account when purchased</span>
              <span className="block text-xs text-zinc-600">
                The buyer gets their own sub-account and an admin login, and we email them a link to set their password. For subscriptions, the sub-account is suspended if they cancel or
                stop paying (needs the Stripe webhook) and reactivated when they pay.
              </span>
            </span>
            <Toggle checked={saas} onChange={setSaas} label="Creates a sub-account when purchased" />
          </label>
        )}
        {product && (
          <label className="flex items-center justify-between text-sm">
            Active (can be bought)
            <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
          </label>
        )}
        <div className="flex items-center justify-between pt-1">
          {product ? (
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!f.name.trim() || cents === null}>
              {product ? "Save" : "Create product"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
