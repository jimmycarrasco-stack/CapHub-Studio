import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentContext, getSessionUser } from "@/lib/auth";
import { SignOutButton } from "./sign-out";

export const metadata = { title: "No access yet" };
export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await getCurrentContext()) redirect("/");
  if (user.agency_role) redirect("/agency");
  return (
    <AuthCard title="You're signed in" subtitle={user.email}>
      <p className="text-sm text-zinc-600">You haven&apos;t been added to a sub-account yet. Ask your agency admin to add you from the sub-account&apos;s Settings → Team page, then sign in again.</p>
      <SignOutButton />
    </AuthCard>
  );
}
