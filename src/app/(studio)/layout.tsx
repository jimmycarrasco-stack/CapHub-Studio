import { redirect } from "next/navigation";
import { GuideLauncher } from "@/components/guide";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui";
import { getCurrentContext, getSessionUser, listUserLocations } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCurrentContext();

  if (!ctx) {
    // Signed in but no sub-account yet (agency admins can create one; others must be invited).
    return (
      <div className="flex h-full flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar
        user={{ name: user.name, email: user.email, isAgencyAdmin: !!user.agency_role, isAdmin: ctx.role === "admin" }}
        location={{ id: ctx.location.id, name: ctx.location.name }}
        locations={listUserLocations(user).map((l) => ({ id: l.id, name: l.name }))}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      <GuideLauncher locationId={ctx.location.id} locationName={ctx.location.name} />
      <Toaster />
    </div>
  );
}
