import { BuildTabs } from "@/components/build-tabs";
import { PageHeader } from "@/components/ui";
import { listDomains } from "@/lib/crm/domains";
import { listFunnels } from "@/lib/crm/funnels";
import { pageCtx } from "@/lib/page-ctx";
import { listSites } from "@/lib/repo";
import { Domains } from "./domains";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
  const ctx = await pageCtx();
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || null;
  let appHost: string | null = null;
  try {
    appHost = base ? new URL(base).hostname : null;
  } catch {
    appHost = null;
  }
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Sites & Funnels" subtitle="Put a site or funnel on your own domain, like book.yourbusiness.com." />
      <BuildTabs active="domains" />
      <Domains
        initial={listDomains(ctx.location.id)}
        sites={listSites(ctx.location.id).map((s) => ({ id: s.id, name: s.name, published: s.published }))}
        funnels={listFunnels(ctx.location.id).map((f) => ({ id: f.id, name: f.name }))}
        appHost={appHost}
        canEdit={ctx.role === "admin"}
        isAgencyAdmin={ctx.isAgencyAdmin}
      />
    </div>
  );
}
