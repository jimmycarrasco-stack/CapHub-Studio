import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { login } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="login" action={login} />;
}
