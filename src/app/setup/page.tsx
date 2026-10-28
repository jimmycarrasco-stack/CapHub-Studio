import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { listAllLocations, userCount } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up CapHub" };

export default function SetupPage() {
  if (userCount() > 0) redirect("/login");
  return (
    <AuthCard title="Set up CapHub" subtitle="Create the agency owner account">
      <SetupForm hasLocations={listAllLocations().length > 0} />
    </AuthCard>
  );
}
