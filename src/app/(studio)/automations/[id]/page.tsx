import { notFound } from "next/navigation";
import { getAutomation, listRuns } from "@/lib/crm/automations";
import { listLocationTags } from "@/lib/crm/contacts";
import { listProducts } from "@/lib/crm/payments";
import { listPipelines } from "@/lib/crm/pipelines";
import { baseUrlFromHeaders } from "@/lib/request-url";
import { pageAccess, pageCtx } from "@/lib/page-ctx";
import { listSites } from "@/lib/repo";
import { AutomationBuilder } from "./builder";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: id === "new" ? "New automation" : (getAutomation(id)?.name ?? "Automation") };
}

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = id === "new" ? null : getAutomation(id);
  if (id !== "new" && !a) notFound();
  if (a) await pageAccess(a.location_id);
  const ctx = await pageCtx();
  const loc = a?.location_id ?? ctx.location.id;
  return (
    <AutomationBuilder
      automation={a}
      runs={a ? listRuns({ automationId: a.id, limit: 100 }) : []}
      hookUrl={a ? `${await baseUrlFromHeaders()}/api/hooks/${a.id}?key=${a.hook_secret}` : null}
      options={{
        pipelines: listPipelines(loc).map((p) => ({ id: p.id, name: p.name, stages: p.stages.map((s) => ({ id: s.id, name: s.name })) })),
        products: listProducts(loc).map((p) => ({ id: p.id, name: p.name })),
        sites: listSites(loc).map((s) => ({ id: s.id, name: s.name })),
        tags: listLocationTags(loc).map((t) => t.tag),
      }}
    />
  );
}
