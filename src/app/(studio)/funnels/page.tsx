import { BuildTabs } from "@/components/build-tabs";
import { PageHeader } from "@/components/ui";
import { listFunnels } from "@/lib/crm/funnels";
import { pageCtx } from "@/lib/page-ctx";
import { listSites } from "@/lib/repo";
import { Funnels } from "./funnels";

export const metadata = { title: "Funnels" };

export default async function FunnelsPage() {
  const ctx = await pageCtx();
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader title="Sites & Funnels" subtitle="A funnel chains pages: after a visitor submits a form on one step, they go to the next (e.g. opt-in → offer → thank you)." />
      <BuildTabs active="funnels" />
      <Funnels initial={listFunnels(ctx.location.id)} sites={listSites(ctx.location.id).map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
