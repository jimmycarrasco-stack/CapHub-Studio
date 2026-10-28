import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui";
import { PROVIDER_LABELS } from "@/lib/llm/catalog";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { getAiSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth alongside the proxy.
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.APP_SECRET))) redirect("/login");
  const { activeProvider, providers } = getAiSettings();

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar provider={`${PROVIDER_LABELS[activeProvider]} · ${providers[activeProvider].model}`} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      <Toaster />
    </div>
  );
}
