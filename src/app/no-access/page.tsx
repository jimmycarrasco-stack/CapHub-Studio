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
      <p className="text-sm text-zinc-600">You don&apos;t have an active sub-account right now — either you haven&apos;t been added to one yet, or your account is paused (for example, if a subscription ended). Contact your account provider, then sign in again.</p>
      <SignOutButton />
    </AuthCard>
  );
}
