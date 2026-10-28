import { notFound } from "next/navigation";
import { pageAccess } from "@/lib/page-ctx";
import { isRunning } from "@/lib/apps/jobs";
import { getApp, listAppMessages } from "@/lib/apps/repo";
import { AppWorkspace } from "./app-workspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: getApp((await params).id)?.name ?? "App" };
}

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = getApp(id);
  if (!app) notFound();
  await pageAccess(app.location_id);
  return <AppWorkspace initialApp={app} initialMessages={listAppMessages(id)} initiallyWorking={isRunning(id)} />;
}
