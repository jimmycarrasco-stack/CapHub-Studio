import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { contactName, listContacts, listTasks } from "@/lib/crm/contacts";
import { smtpStatus } from "@/lib/crm/email";
import { formatMoney, listOrders, listProducts, revenueStats, stripeStatus } from "@/lib/crm/payments";
import { pipelineStats } from "@/lib/crm/pipelines";
import { cx, timeAgo } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/llm/catalog";
import { pageCtx } from "@/lib/page-ctx";
import { listSites } from "@/lib/repo";
import { getAiSettings } from "@/lib/settings";
import { OpenGuideButton } from "@/components/guide";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await pageCtx();
  const loc = ctx.location.id;
  const count = (sql: string) => (db().prepare(sql).get(loc) as { n: number }).n;

  const contacts = listContacts(loc, { limit: 6 });
  const newContacts30 = count("SELECT COUNT(*) AS n FROM contacts WHERE location_id = ? AND created_at >= datetime('now', '-30 days')");
  const pipe = pipelineStats(loc);
  const rev = revenueStats(loc);
  const tasks = listTasks(loc, { open: true, limit: 6 });
  const orders = listOrders(loc, { limit: 5 });
  const ai = getAiSettings();
  const aiReady = ai.providers[ai.activeProvider].keySource !== "none";
  const currency = rev[0]?.currency ?? listProducts(loc)[0]?.currency ?? "cad";
  const rev30 = rev[0]?.last30 ?? 0;

  const steps = [
    ...(ctx.isAgencyAdmin ? [{ done: aiReady, label: `Add an AI key (${PROVIDER_LABELS[ai.activeProvider]})`, href: "/settings/ai" }] : []),
    { done: contacts.total > 0, label: "Add or import your contacts", href: "/contacts" },
    { done: stripeStatus(loc).connected, label: "Connect Stripe to take payments", href: "/settings#stripe" },
    { done: smtpStatus(loc).configured, label: "Set up email sending", href: "/settings#email" },
    { done: listProducts(loc).length > 0, label: "Create your first product", href: "/payments" },
    { done: listSites(loc).length > 0, label: "Build a website or funnel with AI", href: "/sites" },
    { done: count("SELECT COUNT(*) AS n FROM automations WHERE location_id = ?") > 0, label: "Create an automation", href: "/automations" },
  ];
  const doneSteps = steps.filter((s) => s.done).length;

  const tiles = [
    { label: "Contacts", value: contacts.total.toLocaleString(), sub: `+${newContacts30} in 30 days`, href: "/contacts" },
    { label: "Open pipeline", value: formatMoney(pipe.open_value, currency), sub: `${pipe.open_count} open deal${pipe.open_count === 1 ? "" : "s"}`, href: "/pipelines" },
    { label: "Revenue (30 days)", value: formatMoney(rev30, currency), sub: `${formatMoney(rev[0]?.total ?? 0, currency)} all time`, href: "/payments" },
    { label: "Won (30 days)", value: formatMoney(pipe.won_value_30d, currency), sub: `${pipe.won_30d} deal${pipe.won_30d === 1 ? "" : "s"}`, href: "/pipelines" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title={`Welcome back, ${ctx.user.name.split(" ")[0]}`} subtitle={ctx.location.name} actions={<OpenGuideButton />} />

      {doneSteps < steps.length && (
        <section className="mb-6 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Get set up</h2>
            <span className="text-xs text-zinc-500">
              {doneSteps} of {steps.length} done
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={cx("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50", s.done ? "text-zinc-400 line-through" : "text-zinc-800")}>
                  <span className={cx("grid size-4 shrink-0 place-items-center rounded-full text-[10px]", s.done ? "bg-emerald-500 text-white" : "ring-1 ring-zinc-300")}>{s.done ? "✓" : ""}</span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Not sure where to start? Ask the AI Guide (bottom right) — it can do most of these for you.</p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300">
            <div className="text-xs font-medium text-zinc-500">{t.label}</div>
            <div className="mt-1 truncate text-2xl font-semibold tabular-nums text-zinc-900">{t.value}</div>
            <div className="text-xs text-zinc-400">{t.sub}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Panel title="Newest contacts" href="/contacts" linkLabel="All contacts">
          {contacts.contacts.length ? (
            contacts.contacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-zinc-50">
                <span className="truncate">{contactName(c)}</span>
                <span className="shrink-0 text-xs text-zinc-400">{timeAgo(c.created_at)}</span>
              </Link>
            ))
          ) : (
            <Empty>No contacts yet.</Empty>
          )}
        </Panel>

        <Panel title="Open tasks" href="/contacts?view=tasks" linkLabel="All tasks">
          {tasks.length ? (
            tasks.map((t) => (
              <Link key={t.id} href={t.contact_id ? `/contacts/${t.contact_id}` : "/contacts?view=tasks"} className="block px-4 py-2.5 text-sm hover:bg-zinc-50">
                <div className="truncate">{t.title}</div>
                <div className="truncate text-xs text-zinc-400">
                  {t.contact_name ?? "No contact"}
                  {t.due_at ? ` · due ${t.due_at}` : ""}
                </div>
              </Link>
            ))
          ) : (
            <Empty>Nothing due. Nice.</Empty>
          )}
        </Panel>

        <Panel title="Recent payments" href="/payments" linkLabel="Payments">
          {orders.length ? (
            orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{o.product_name ?? "Payment"}</div>
                  <div className="truncate text-xs text-zinc-400">{o.contact_email ?? ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-nums">{formatMoney(o.amount_cents, o.currency)}</div>
                  {o.status !== "paid" && <Badge tone="amber">{o.status}</Badge>}
                </div>
              </div>
            ))
          ) : (
            <Empty>No payments yet.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white ring-1 ring-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href} className="text-xs font-medium text-brand-600 hover:underline">
          {linkLabel}
        </Link>
      </div>
      <div className="divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-zinc-500">{children}</p>;
}
