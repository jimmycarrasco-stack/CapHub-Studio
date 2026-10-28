import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { PROVIDER_LABELS, PROVIDERS } from "@/lib/llm/catalog";
import { listApps } from "@/lib/apps/repo";
import { dashboardStats, listAgents, listSites } from "@/lib/repo";
import { getAiSettings } from "@/lib/settings";

export const metadata = { title: "Dashboard" };

export default function Dashboard() {
  const stats = dashboardStats();
  const ai = getAiSettings();
  const sites = listSites().slice(0, 5);
  const agents = listAgents().slice(0, 5);
  const activeHasKey = ai.providers[ai.activeProvider].keySource !== "none";

  const tiles = [
    { label: "Apps", value: listApps().length, sub: "full-stack builds", href: "/apps" },
    { label: "Sites", value: stats.sites, sub: `${stats.published} published`, href: "/sites" },
    { label: "Form submissions", value: stats.submissions, sub: "across all sites", href: "/sites" },
    { label: "Agents", value: stats.agents, sub: "in Agent Studio", href: "/agents" },
    { label: "Chats", value: stats.conversations, sub: "widget conversations", href: "/agents" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Dashboard" subtitle="Build apps, sites and AI agents from a prompt." />

      {!activeHasKey && (
        <Link href="/settings" className="mb-6 block rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
          <strong className="font-semibold">Add an API key to get started.</strong> {PROVIDER_LABELS[ai.activeProvider]} is the active provider but has no key yet →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300">
            <div className="text-xs font-medium text-zinc-500">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{t.value}</div>
            <div className="text-xs text-zinc-400">{t.sub}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white ring-1 ring-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent sites</h2>
            <Link href="/sites" className="text-xs font-medium text-brand-600 hover:underline">
              New site
            </Link>
          </div>
          {sites.length ? (
            <ul className="divide-y divide-zinc-100">
              {sites.map((s) => (
                <li key={s.id}>
                  <Link href={`/sites/${s.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-50">
                    <span className="truncate">{s.name}</span>
                    <span className="text-xs text-zinc-400">{s.published ? "Published" : "Draft"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-zinc-500">No sites yet.</p>
          )}
        </section>

        <section className="rounded-xl bg-white ring-1 ring-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Agents</h2>
            <Link href="/agents" className="text-xs font-medium text-brand-600 hover:underline">
              New agent
            </Link>
          </div>
          {agents.length ? (
            <ul className="divide-y divide-zinc-100">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-50">
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-zinc-400">{a.widget_enabled ? "Widget live" : "Widget off"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-zinc-500">No agents yet.</p>
          )}
        </section>
      </div>

      <section className="mt-8 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <h2 className="mb-3 text-sm font-semibold">AI providers</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <div key={p} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
              <div>
                <div className="font-medium">
                  {PROVIDER_LABELS[p]} {ai.activeProvider === p && <span className="ml-1 text-xs font-medium text-brand-600">Active</span>}
                </div>
                <div className="font-mono text-xs text-zinc-500">{ai.providers[p].model}</div>
              </div>
              <span className="text-xs text-zinc-500">
                {ai.providers[p].keySource === "none" ? "No key" : `Key from ${ai.providers[p].keySource === "env" ? ".env" : "settings"}`}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
