import { notFound } from "next/navigation";
import { getSite, listAgents, listSiteMessages } from "@/lib/repo";
import { SiteEditor } from "./site-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const site = getSite((await params).id);
  return { title: site?.name ?? "Site" };
}

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = getSite(id);
  if (!site) notFound();
  const agents = listAgents().map((a) => ({ id: a.id, name: a.name, widget_enabled: a.widget_enabled }));
  return <SiteEditor initialSite={site} initialMessages={listSiteMessages(id)} agents={agents} />;
}
