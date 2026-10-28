import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signup } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="signup" action={signup} />;
}
