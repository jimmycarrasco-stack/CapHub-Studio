import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { userCount } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (userCount() === 0) redirect("/setup");
  return (
    <AuthCard title="CapHub" subtitle="Sign in to your account">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
