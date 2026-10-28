import Link from "next/link";
import { BuildTabs } from "@/components/build-tabs";
import { Badge, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { pageCtx } from "@/lib/page-ctx";
import { listSites } from "@/lib/repo";
import { NewSiteForm } from "./new-site-form";

export const metadata = { title: "Site Builder" };

export default async function SitesPage() {
  const ctx = await pageCtx();
  const sites = listSites(ctx.location.id);
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Sites & Funnels" subtitle="Describe a website, landing page, funnel step or form — AI builds it, you refine it in chat or code. Forms add contacts to your CRM." />
      <BuildTabs active="sites" />
      <NewSiteForm />

      <h2 className="mt-10 mb-3 text-sm font-semibold text-zinc-900">Your sites</h2>
      {sites.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
          No sites yet. Describe one above to get started.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((s) => (
            <Link key={s.id} href={`/sites/${s.id}`} className="group rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-brand-700">{s.name}</h3>
                {s.published ? <Badge tone="green">Published</Badge> : <Badge>Draft</Badge>}
              </div>
              <p className="mt-1 truncate font-mono text-xs text-zinc-400">/p/{s.slug}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {s.submissions} submission{s.submissions === 1 ? "" : "s"}
                  {s.agent_id ? " · agent attached" : ""}
                </span>
                <span>{timeAgo(s.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
